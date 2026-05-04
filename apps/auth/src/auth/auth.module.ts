import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnonymousCreationQuota } from '../database/entities/anonymous-creation-quota.entity';
import { AnonymousSession } from '../database/entities/anonymous-session.entity';
import { JwtSigningKey } from '../database/entities/jwt-signing-key.entity';
import { OAuthAccount } from '../database/entities/oauth-account.entity';
import { OAuthProviderToken } from '../database/entities/oauth-provider-token.entity';
import { PasswordCredential } from '../database/entities/password-credential.entity';
import { Principal } from '../database/entities/principal.entity';
import { UserEmail } from '../database/entities/user-email.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { User } from '../database/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthSessionService } from './auth-session.service';
import { JwtService } from './jwt.service';
import { TokenHashService } from './token-hash.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Principal,
      AnonymousSession,
      AnonymousCreationQuota,
      User,
      UserEmail,
      PasswordCredential,
      OAuthAccount,
      OAuthProviderToken,
      UserSession,
      JwtSigningKey,
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthSessionService, JwtService, TokenHashService],
  exports: [JwtService, TokenHashService],
})
export class AuthModule {}
