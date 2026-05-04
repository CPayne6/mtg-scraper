import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exportJWK, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'crypto';
import { existsSync, readFileSync } from 'fs';
import type { PrincipalKind } from '../database/entities/principal.entity';

export interface PrincipalAccessTokenClaims extends JWTPayload {
  principal_kind: PrincipalKind;
  user_uuid?: string;
  sid?: string;
}

@Injectable()
export class JwtService {
  private readonly logger = new Logger(JwtService.name);
  private keyPair?: { privateKey: KeyObject; publicKey: KeyObject };

  constructor(private readonly configService: ConfigService) {}

  async signAccessToken(input: {
    principalUuid: string;
    principalKind: PrincipalKind;
    userUuid?: string;
    sessionUuid?: string;
  }): Promise<string> {
    const { privateKey } = this.getKeys();
    const ttlSeconds =
      this.configService.get<number>('jwt.accessTtlSeconds') ?? 900;

    return new SignJWT({
      principal_kind: input.principalKind,
      user_uuid: input.userUuid,
      sid: input.sessionUuid,
      typ: 'access',
    })
      .setProtectedHeader({
        alg: 'EdDSA',
        kid: this.configService.get<string>('jwt.keyId'),
      })
      .setSubject(input.principalUuid)
      .setIssuer(this.configService.get<string>('jwt.issuer') ?? 'scoutlgs-auth')
      .setAudience(
        this.configService.get<string>('jwt.audience') ?? 'scoutlgs-api',
      )
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(privateKey);
  }

  async verifyAccessToken(token: string): Promise<PrincipalAccessTokenClaims> {
    const { publicKey } = this.getKeys();
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: this.configService.get<string>('jwt.issuer'),
      audience: this.configService.get<string>('jwt.audience'),
      algorithms: ['EdDSA'],
    });
    return payload as PrincipalAccessTokenClaims;
  }

  async getJwks(): Promise<{ keys: Record<string, unknown>[] }> {
    const { publicKey } = this.getKeys();
    const jwk = await exportJWK(publicKey);
    return {
      keys: [
        {
          ...jwk,
          kid: this.configService.get<string>('jwt.keyId'),
          alg: 'EdDSA',
          use: 'sig',
        },
      ],
    };
  }

  private getKeys(): { privateKey: KeyObject; publicKey: KeyObject } {
    if (this.keyPair) {
      return this.keyPair;
    }

    const privateKeyFile = this.configService.get<string>('jwt.privateKeyFile');
    if (privateKeyFile && existsSync(privateKeyFile)) {
      const privateKey = createPrivateKey(
        this.decodePemSecret(readFileSync(privateKeyFile, 'utf8')),
      );
      const publicKey = createPublicKey(privateKey);
      this.keyPair = { privateKey, publicKey };
      return this.keyPair;
    }

    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('AUTH_JWT_PRIVATE_KEY_FILE is required in production');
    }

    this.logger.warn(
      'AUTH_JWT_PRIVATE_KEY_FILE was not provided; using an ephemeral development Ed25519 key',
    );
    this.keyPair = generateKeyPairSync('ed25519');
    return this.keyPair;
  }

  private decodePemSecret(secret: string): string {
    const trimmed = secret.trim();
    if (trimmed.includes('BEGIN PRIVATE KEY')) {
      return trimmed;
    }
    return Buffer.from(trimmed, 'base64').toString('utf8').trim();
  }
}
