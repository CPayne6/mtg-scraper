import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GoogleProfile {
  sub: string;
  email?: string;
  emailVerified: boolean;
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

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT =
  'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

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

  buildAuthorizationUrl(state: string): string {
    this.assertConfigured();
    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.callbackUrl!,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      state,
      access_type: 'online',
      include_granted_scopes: 'true',
      prompt: 'select_account',
    });
    return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
  }

  async exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
    this.assertConfigured();
    const tokenResponse = await this.exchangeCode(code);
    const userInfo = await this.fetchUserInfo(tokenResponse.access_token);
    return {
      sub: userInfo.sub,
      email: userInfo.email,
      emailVerified: userInfo.email_verified === true,
      name: userInfo.name,
      picture: userInfo.picture,
    };
  }

  private async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      code,
      client_id: this.clientId!,
      client_secret: this.clientSecret!,
      redirect_uri: this.callbackUrl!,
      grant_type: 'authorization_code',
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
