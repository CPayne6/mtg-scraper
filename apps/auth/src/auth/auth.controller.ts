import {
  Controller,
  Body,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { AuthSessionService } from './auth-session.service';
// Email/password auth is intentionally disabled until email verification ships.
// Keep the DTOs and service methods around so the wiring can be restored.
// import { LoginDto } from './dto/login.dto';
// import { SignupDto } from './dto/signup.dto';
import { GoogleOAuthService } from './google-oauth.service';
import { JwtService } from './jwt.service';
import {
  EmailNotAuthoritativeError,
  EmailNotVerifiedError,
} from './oauth-errors';
import { OAuthSignInService } from './oauth-sign-in.service';
import { UserAuthService } from './user-auth.service';

type RequestWithCookies = Request & {
  cookies?: Record<string, string | undefined>;
};

interface OAuthStateCookie {
  nonce: string;
  redirect: string;
  codeVerifier: string;
}

const SAFE_REDIRECT_PATTERN = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$/;

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authSessionService: AuthSessionService,
    private readonly userAuthService: UserAuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly oauthSignInService: OAuthSignInService,
  ) {}

  @Get('session')
  getSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authSessionService.getSession(req, res);
  }

  @Post('anonymous-session')
  createAnonymousSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authSessionService.createAnonymousSession(req, res);
  }

  @Get('delivery-address')
  getDeliveryAddress(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authSessionService.getDeliveryAddress(req, res);
  }

  @Put('delivery-address')
  saveDeliveryAddress(@Body() address: Record<string, unknown>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authSessionService.saveDeliveryAddress(req, res, address);
  }

  @Delete('delivery-address')
  removeDeliveryAddress(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authSessionService.removeDeliveryAddress(req, res);
  }

  // @Post('signup')
  // signup(
  //   @Body() dto: SignupDto,
  //   @Req() req: Request,
  //   @Res({ passthrough: true }) res: Response,
  // ) {
  //   return this.userAuthService.signup(dto, req, res);
  // }

  // @Post('login')
  // login(
  //   @Body() dto: LoginDto,
  //   @Req() req: Request,
  //   @Res({ passthrough: true }) res: Response,
  // ) {
  //   return this.userAuthService.login(dto, req, res);
  // }

  @Post('logout')
  logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.userAuthService.logout(req, res);
  }

  @Get('google')
  startGoogleSignIn(
    @Query('redirect') redirect: string | undefined,
    @Res() res: Response,
  ) {
    if (!this.googleOAuthService.isConfigured()) {
      const target = this.frontendErrorUrl('google-not-configured');
      return res.redirect(target);
    }

    const safeRedirect = this.sanitizeRedirect(redirect);
    const nonce = randomBytes(32).toString('base64url');
    const codeVerifier = this.newPkceVerifier();
    this.setStateCookie(res, { nonce, redirect: safeRedirect, codeVerifier });

    const authorizationUrl = this.googleOAuthService.buildAuthorizationUrl(
      nonce,
      this.pkceChallenge(codeVerifier),
    );
    return res.redirect(authorizationUrl);
  }

  @Get('google/callback')
  async handleGoogleCallback(
    @Req() req: RequestWithCookies,
    @Res() res: Response,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
  ) {
    const stateCookie = this.readStateCookie(req);

    if (!state || !stateCookie || stateCookie.nonce !== state) {
      return res.redirect(this.frontendErrorUrl('invalid-state'));
    }

    this.clearStateCookie(res);

    if (error) {
      this.logger.warn(`Google OAuth provider error: ${error}`);
      return res.redirect(this.frontendErrorUrl(error));
    }

    if (!code) {
      return res.redirect(this.frontendErrorUrl('invalid-state'));
    }

    try {
      const profile = await this.googleOAuthService.exchangeCodeForProfile(
        code,
        stateCookie.codeVerifier,
      );
      await this.oauthSignInService.signInWithGoogle(profile, req, res);
    } catch (err) {
      this.logger.error('Google OAuth sign-in failed', err as Error);
      const reason =
        err instanceof EmailNotVerifiedError
          ? err.code
          : err instanceof EmailNotAuthoritativeError
            ? err.code
            : 'sign-in-failed';
      return res.redirect(this.frontendErrorUrl(reason));
    }

    return res.redirect(this.frontendSuccessUrl(stateCookie.redirect));
  }

  @Get('internal/.well-known/jwks.json')
  getJwks(@Req() req: Request) {
    const host = req.header('host')?.split(':')[0].toLowerCase();
    const allowedHosts =
      this.configService.get<string[]>('jwt.internalAllowedHosts') ?? [];

    if (!host || !allowedHosts.includes(host)) {
      throw new NotFoundException();
    }

    return this.jwtService.getJwks();
  }

  private sanitizeRedirect(redirect: string | undefined): string {
    if (!redirect) return '/';
    if (!SAFE_REDIRECT_PATTERN.test(redirect)) return '/';
    return redirect;
  }

  private setStateCookie(res: Response, payload: OAuthStateCookie): void {
    const ttlSeconds =
      this.configService.get<number>('oauth.stateTtlSeconds') ?? 600;
    res.cookie(this.stateCookieName, this.encodeState(payload), {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'lax',
      domain: this.cookieDomain,
      path: '/auth',
      maxAge: ttlSeconds * 1000,
    });
  }

  private readStateCookie(
    req: RequestWithCookies,
  ): OAuthStateCookie | null {
    const raw = req.cookies?.[this.stateCookieName];
    if (!raw) return null;

    const [encodedPayload, signature] = raw.split('.');
    if (
      !encodedPayload ||
      !signature ||
      !this.hasValidStateSignature(encodedPayload, signature)
    ) {
      return null;
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as Partial<OAuthStateCookie>;
      if (
        typeof decoded.nonce === 'string' &&
        typeof decoded.redirect === 'string' &&
        typeof decoded.codeVerifier === 'string'
      ) {
        return {
          nonce: decoded.nonce,
          redirect: this.sanitizeRedirect(decoded.redirect),
          codeVerifier: decoded.codeVerifier,
        };
      }
    } catch {
      // fall through
    }
    return null;
  }

  private clearStateCookie(res: Response): void {
    res.clearCookie(this.stateCookieName, {
      secure: this.cookieSecure,
      sameSite: 'lax',
      domain: this.cookieDomain,
      path: '/auth',
    });
  }

  private encodeState(payload: OAuthStateCookie): string {
    const encodedPayload = Buffer.from(
      JSON.stringify(payload),
      'utf8',
    ).toString('base64url');
    return `${encodedPayload}.${this.signStatePayload(encodedPayload)}`;
  }

  private hasValidStateSignature(
    encodedPayload: string,
    signature: string,
  ): boolean {
    const expected = this.signStatePayload(encodedPayload);
    const expectedBuffer = Buffer.from(expected, 'base64url');
    const signatureBuffer = Buffer.from(signature, 'base64url');
    return (
      expectedBuffer.length === signatureBuffer.length &&
      timingSafeEqual(expectedBuffer, signatureBuffer)
    );
  }

  private signStatePayload(encodedPayload: string): string {
    return createHmac('sha256', this.stateSigningSecret)
      .update(encodedPayload)
      .digest('base64url');
  }

  private newPkceVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  private pkceChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url');
  }

  private frontendSuccessUrl(redirectPath: string): string {
    return `${this.primaryFrontendOrigin()}${redirectPath}`;
  }

  private frontendErrorUrl(reason: string): string {
    const base = this.primaryFrontendOrigin();
    return `${base}/login?auth_error=${encodeURIComponent(reason)}`;
  }

  private primaryFrontendOrigin(): string {
    const raw = this.configService.get<string>('frontendUrl') ?? '';
    const first = raw.split(',')[0]?.trim();
    return first || 'http://localhost:3001';
  }

  private get stateCookieName(): string {
    return (
      this.configService.get<string>('oauth.stateCookieName') ??
      'scoutlgs_oauth_state'
    );
  }

  private get cookieSecure(): boolean {
    return this.configService.get<boolean>('cookies.secure') ?? true;
  }

  private get cookieDomain(): string | undefined {
    return this.configService.get<string>('cookies.domain');
  }

  private get stateSigningSecret(): string {
    const secret = this.configService.get<string>('security.tokenHashSecret');
    if (!secret) {
      throw new Error('security.tokenHashSecret is not configured');
    }
    return secret;
  }
}
