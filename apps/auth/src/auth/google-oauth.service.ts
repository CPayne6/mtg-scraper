import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface GoogleProfile {
  sub: string;
  email?: string;
  emailVerified: boolean;
  emailAuthoritative: boolean;
  hostedDomain?: string;
  name?: string;
  picture?: string;
}

interface GoogleTokenResponse {
  access_token: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  refresh_token?: string;
}

interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

interface GoogleIdTokenPayload extends JWTPayload {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  hd?: string;
  name?: string;
  picture?: string;
}

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT =
  'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private readonly googleJwks = createRemoteJWKSet(
    new URL(GOOGLE_JWKS_ENDPOINT),
  );

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.clientId && this.clientSecret && this.callbackUrl,
    );
  }

  assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Google OAuth is not configured on this server',
      );
    }
  }

  buildAuthorizationUrl(state: string, codeChallenge: string): string {
    this.assertConfigured();
    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.callbackUrl!,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'online',
      include_granted_scopes: 'true',
      prompt: 'select_account',
    });
    return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
  }

  async exchangeCodeForProfile(
    code: string,
    codeVerifier: string,
  ): Promise<GoogleProfile> {
    this.assertConfigured();
    const tokenResponse = await this.exchangeCode(code, codeVerifier);
    if (!tokenResponse.id_token) {
      throw new Error('Google did not return an ID token');
    }

    const idToken = await this.verifyIdToken(tokenResponse.id_token);
    const userInfo = await this.fetchUserInfo(tokenResponse.access_token);

    if (userInfo.sub !== idToken.sub) {
      throw new Error('Google profile subject mismatch');
    }

    const email =
      typeof idToken.email === 'string' ? idToken.email : userInfo.email;
    const emailVerified = this.toBoolean(idToken.email_verified);
    const hostedDomain =
      typeof idToken.hd === 'string' && idToken.hd.trim()
        ? idToken.hd.trim().toLowerCase()
        : undefined;

    return {
      sub: idToken.sub,
      email,
      emailVerified,
      emailAuthoritative: this.isAuthoritativeEmail(
        email,
        emailVerified,
        hostedDomain,
      ),
      hostedDomain,
      name:
        typeof idToken.name === 'string' ? idToken.name : userInfo.name,
      picture:
        typeof idToken.picture === 'string'
          ? idToken.picture
          : userInfo.picture,
    };
  }

  private async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      code,
      client_id: this.clientId!,
      client_secret: this.clientSecret!,
      redirect_uri: this.callbackUrl!,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });

    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.warn(
        `Google token exchange failed (${response.status}): ${errorBody}`,
      );
      throw new Error('Failed to exchange Google authorization code');
    }

    return (await response.json()) as GoogleTokenResponse;
  }

  private async verifyIdToken(
    idToken: string,
  ): Promise<GoogleIdTokenPayload & { sub: string }> {
    const { payload } = await jwtVerify(idToken, this.googleJwks, {
      audience: this.clientId!,
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      algorithms: ['RS256'],
    });

    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new Error('Google ID token is missing a subject');
    }

    return payload as GoogleIdTokenPayload & { sub: string };
  }

  private async fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.warn(
        `Google userinfo fetch failed (${response.status}): ${errorBody}`,
      );
      throw new Error('Failed to load Google profile');
    }

    return (await response.json()) as GoogleUserInfo;
  }

  private toBoolean(value: boolean | string | undefined): boolean {
    return value === true || value === 'true';
  }

  private isAuthoritativeEmail(
    email: string | undefined,
    emailVerified: boolean,
    hostedDomain: string | undefined,
  ): boolean {
    if (!email || !emailVerified) {
      return false;
    }

    return email.toLowerCase().endsWith('@gmail.com') || Boolean(hostedDomain);
  }

  private get clientId(): string | undefined {
    return this.configService.get<string>('oauth.google.clientId') || undefined;
  }

  private get clientSecret(): string | undefined {
    return (
      this.configService.get<string>('oauth.google.clientSecret') || undefined
    );
  }

  private get callbackUrl(): string | undefined {
    return (
      this.configService.get<string>('oauth.google.callbackUrl') || undefined
    );
  }
}
