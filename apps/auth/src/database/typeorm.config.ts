import { DataSource } from 'typeorm';
import { existsSync, readFileSync } from 'fs';
import { Principal } from './entities/principal.entity';
import { AnonymousSession } from './entities/anonymous-session.entity';
import { AnonymousCreationQuota } from './entities/anonymous-creation-quota.entity';
import { User } from './entities/user.entity';
import { UserEmail } from './entities/user-email.entity';
import { PasswordCredential } from './entities/password-credential.entity';
import { OAuthAccount } from './entities/oauth-account.entity';
import { OAuthProviderToken } from './entities/oauth-provider-token.entity';
import { UserSession } from './entities/user-session.entity';
import { JwtSigningKey } from './entities/jwt-signing-key.entity';

const isProduction = process.env.NODE_ENV === 'production';
const databasePasswordFile = process.env.DATABASE_PASSWORD_FILE;
const databasePassword =
  databasePasswordFile && existsSync(databasePasswordFile)
    ? readFileSync(databasePasswordFile, 'utf8').trim()
    : process.env.DATABASE_PASSWORD || 'postgres';

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5433', 10),
  username: process.env.DATABASE_USER || 'postgres',
  password: databasePassword,
  database: process.env.DATABASE_NAME || 'scoutlgs_auth',
  entities: [
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
  ],
  migrations: isProduction
    ? ['dist/database/migrations/*.js']
    : ['src/database/migrations/*.ts'],
});
