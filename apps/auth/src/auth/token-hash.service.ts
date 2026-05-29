import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

@Injectable()
export class TokenHashService {
  constructor(private readonly configService: ConfigService) {}

  hash(value: string): string {
    const secret = this.configService.get<string>('security.tokenHashSecret');
    if (!secret) {
      throw new Error('AUTH_TOKEN_HASH_SECRET is required');
    }
    return createHmac('sha256', secret).update(value).digest('hex');
  }
}
