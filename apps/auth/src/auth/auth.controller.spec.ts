import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';
import { AuthSessionService } from './auth-session.service';
import { GoogleOAuthService } from './google-oauth.service';
import { JwtService } from './jwt.service';
import { EmailNotAuthoritativeError } from './oauth-errors';
import { OAuthSignInService } from './oauth-sign-in.service';
import { UserAuthService } from './user-auth.service';

const makeHostRequest = (host: string) =>
  ({
    header: vi.fn((name: string) => (name === 'host' ? host : undefined)),
  }) as any;

const makeRequest = (cookies: Record<string, string | undefined> = {}) =>
  ({
    cookies,
    header: vi.fn(),
  }) as any;

const makeResponse = () =>
  ({
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    redirect: vi.fn((target: string) => target),
  }) as any;

describe('AuthController', () => {
  const setup = () => {
    const authSessionService = {
      getSession: vi.fn().mockResolvedValue({ authenticated: false }),
      createAnonymousSession: vi.fn().mockResolvedValue({
        authenticated: false,
        principal: { uuid: 'principal-uuid', kind: 'anonymous' },
      }),
    } as unknown as AuthSessionService;

    const jwtService = {
      getJwks: vi.fn().mockResolvedValue({ keys: [{ kid: 'primary-1' }] }),
    } as unknown as JwtService;

    const userAuthService = {
      signup: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    } as unknown as UserAuthService;

    const configService = {
      get: vi.fn((key: string) => {
        const values: Record<string, unknown> = {
          'jwt.internalAllowedHosts': ['auth', 'localhost'],
          frontendUrl: 'https://scoutlgs.ca',
          'cookies.secure': true,
          'cookies.domain': 'scoutlgs.ca',
          'oauth.stateCookieName': 'scoutlgs_oauth_state',
          'oauth.stateTtlSeconds': 600,
          'security.tokenHashSecret':
            'test-state-signing-secret-value-32-chars',
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    const googleOAuthService = {
      isConfigured: vi.fn().mockReturnValue(true),
      buildAuthorizationUrl: vi.fn().mockReturnValue('https://google.test/auth'),
      exchangeCodeForProfile: vi.fn().mockResolvedValue({
        sub: 'google-sub',
        email: 'user@gmail.com',
        emailVerified: true,
        emailAuthoritative: true,
      }),
    } as unknown as GoogleOAuthService;

    const oauthSignInService = {
      signInWithGoogle: vi.fn().mockResolvedValue({
        authenticated: true,
      }),
    } as unknown as OAuthSignInService;

    return {
      authSessionService,
      jwtService,
      googleOAuthService,
      oauthSignInService,
      controller: new AuthController(
        authSessionService,
        userAuthService,
        jwtService,
        configService,
        googleOAuthService,
        oauthSignInService,
      ),
    };
  };

  it('keeps GET /session read-only by delegating to getSession only', async () => {
    const { authSessionService, controller } = setup();
    const req = {} as any;
    const res = {} as any;

    await controller.getSession(req, res);

    expect(authSessionService.getSession).toHaveBeenCalledWith(req, res);
    expect(authSessionService.createAnonymousSession).not.toHaveBeenCalled();
  });

  it('creates or reuses anonymous sessions through POST /anonymous-session', async () => {
    const { authSessionService, controller } = setup();
    const req = {} as any;
    const res = {} as any;

    await controller.createAnonymousSession(req, res);

    expect(authSessionService.createAnonymousSession).toHaveBeenCalledWith(
      req,
      res,
    );
  });

  it('serves JWKS to internal allowed hosts', async () => {
    const { controller, jwtService } = setup();

    const jwks = await controller.getJwks(makeHostRequest('auth:5002'));

    expect(jwtService.getJwks).toHaveBeenCalled();
    expect(jwks).toEqual({ keys: [{ kid: 'primary-1' }] });
  });

  it('hides JWKS from non-internal hosts', () => {
    const { controller, jwtService } = setup();

    expect(() => controller.getJwks(makeHostRequest('scoutlgs.ca'))).toThrow(
      NotFoundException,
    );
    expect(jwtService.getJwks).not.toHaveBeenCalled();
  });

  it('starts Google OAuth with signed state and PKCE', () => {
    const { controller, googleOAuthService } = setup();
    const res = makeResponse();

    controller.startGoogleSignIn('/lists', res);

    expect(res.cookie).toHaveBeenCalledWith(
      'scoutlgs_oauth_state',
      expect.stringMatching(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        domain: 'scoutlgs.ca',
        path: '/auth',
      }),
    );
    expect(googleOAuthService.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    );
    expect(res.redirect).toHaveBeenCalledWith('https://google.test/auth');
  });

  it('exchanges a valid Google callback with the stored PKCE verifier', async () => {
    const { controller, googleOAuthService, oauthSignInService } = setup();
    const startRes = makeResponse();

    controller.startGoogleSignIn('/lists', startRes);

    const stateCookie = startRes.cookie.mock.calls[0][1] as string;
    const state = (
      googleOAuthService.buildAuthorizationUrl as any
    ).mock.calls[0][0] as string;
    const [encodedPayload] = stateCookie.split('.');
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as { codeVerifier: string };
    const callbackRes = makeResponse();

    await controller.handleGoogleCallback(
      makeRequest({ scoutlgs_oauth_state: stateCookie }),
      callbackRes,
      'auth-code',
      state,
      undefined,
    );

    expect(googleOAuthService.exchangeCodeForProfile).toHaveBeenCalledWith(
      'auth-code',
      decoded.codeVerifier,
    );
    expect(oauthSignInService.signInWithGoogle).toHaveBeenCalled();
    expect(callbackRes.redirect).toHaveBeenCalledWith('https://scoutlgs.ca/lists');
  });

  it('rejects tampered OAuth state cookies without clearing the active state', async () => {
    const { controller, googleOAuthService } = setup();
    const startRes = makeResponse();

    controller.startGoogleSignIn('/lists', startRes);

    const stateCookie = startRes.cookie.mock.calls[0][1] as string;
    const state = (
      googleOAuthService.buildAuthorizationUrl as any
    ).mock.calls[0][0] as string;
    const callbackRes = makeResponse();

    await controller.handleGoogleCallback(
      makeRequest({ scoutlgs_oauth_state: `${stateCookie}x` }),
      callbackRes,
      'auth-code',
      state,
      undefined,
    );

    expect(googleOAuthService.exchangeCodeForProfile).not.toHaveBeenCalled();
    expect(callbackRes.clearCookie).not.toHaveBeenCalled();
    expect(callbackRes.redirect).toHaveBeenCalledWith(
      'https://scoutlgs.ca/login?auth_error=invalid-state',
    );
  });

  it('maps typed OAuth sign-in errors to their auth_error codes', async () => {
    const { controller, googleOAuthService, oauthSignInService } = setup();
    const startRes = makeResponse();
    (oauthSignInService.signInWithGoogle as any).mockRejectedValue(
      new EmailNotAuthoritativeError(),
    );

    controller.startGoogleSignIn('/lists', startRes);

    const stateCookie = startRes.cookie.mock.calls[0][1] as string;
    const state = (
      googleOAuthService.buildAuthorizationUrl as any
    ).mock.calls[0][0] as string;
    const callbackRes = makeResponse();

    await controller.handleGoogleCallback(
      makeRequest({ scoutlgs_oauth_state: stateCookie }),
      callbackRes,
      'auth-code',
      state,
      undefined,
    );

    expect(callbackRes.redirect).toHaveBeenCalledWith(
      'https://scoutlgs.ca/login?auth_error=email-not-authoritative',
    );
  });
});
