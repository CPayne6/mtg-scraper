import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdentitySchema1772300000000 implements MigrationInterface {
  name = 'CreateIdentitySchema1772300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE "principals" (
        "id" SERIAL PRIMARY KEY,
        "uuid" uuid NOT NULL DEFAULT gen_random_uuid(),
        "kind" varchar(16) NOT NULL,
        "last_seen_at" TIMESTAMP,
        "expires_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_principals_uuid" UNIQUE ("uuid"),
        CONSTRAINT "CHK_principals_kind" CHECK ("kind" IN ('anonymous', 'user'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_principals_kind" ON "principals" ("kind")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_principals_expires_at" ON "principals" ("expires_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "anonymous_sessions" (
        "id" SERIAL PRIMARY KEY,
        "principal_id" int NOT NULL REFERENCES "principals"("id") ON DELETE CASCADE,
        "token_hash" varchar(128) NOT NULL,
        "ip_hash" varchar(128),
        "user_agent_hash" varchar(128),
        "last_seen_at" TIMESTAMP,
        "expires_at" TIMESTAMP NOT NULL,
        "revoked_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_anonymous_sessions_token_hash" UNIQUE ("token_hash")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_anonymous_sessions_principal_id" ON "anonymous_sessions" ("principal_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_anonymous_sessions_expires_at" ON "anonymous_sessions" ("expires_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "anonymous_creation_quotas" (
        "id" SERIAL PRIMARY KEY,
        "ip_hash" varchar(128) NOT NULL,
        "window_start" date NOT NULL,
        "created_count" int NOT NULL DEFAULT 0,
        "blocked_until" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_anonymous_creation_quotas_ip_window" UNIQUE ("ip_hash", "window_start")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL PRIMARY KEY,
        "uuid" uuid NOT NULL DEFAULT gen_random_uuid(),
        "principal_id" int NOT NULL REFERENCES "principals"("id") ON DELETE CASCADE,
        "primary_email_id" int,
        "display_name" varchar(120),
        "disabled_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_uuid" UNIQUE ("uuid"),
        CONSTRAINT "UQ_users_principal_id" UNIQUE ("principal_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_emails" (
        "id" SERIAL PRIMARY KEY,
        "user_id" int NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "email" varchar(320) NOT NULL,
        "normalized_email" varchar(320) NOT NULL,
        "source" varchar(32) NOT NULL,
        "verified_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_emails_normalized_email" UNIQUE ("normalized_email")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_user_emails_user_id" ON "user_emails" ("user_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_primary_email"
      FOREIGN KEY ("primary_email_id") REFERENCES "user_emails"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "password_credentials" (
        "id" SERIAL PRIMARY KEY,
        "user_id" int NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "password_hash" text NOT NULL,
        "password_updated_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_password_credentials_user_id" UNIQUE ("user_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "oauth_accounts" (
        "id" SERIAL PRIMARY KEY,
        "user_id" int NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "provider" varchar(32) NOT NULL,
        "provider_subject" varchar(255) NOT NULL,
        "provider_email" varchar(320),
        "provider_email_verified" boolean NOT NULL DEFAULT false,
        "display_name" varchar(120),
        "avatar_url" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_oauth_accounts_provider_subject" UNIQUE ("provider", "provider_subject")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_oauth_accounts_user_id" ON "oauth_accounts" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "oauth_provider_tokens" (
        "id" SERIAL PRIMARY KEY,
        "oauth_account_id" int NOT NULL REFERENCES "oauth_accounts"("id") ON DELETE CASCADE,
        "refresh_token_ciphertext" text NOT NULL,
        "scopes" text[] NOT NULL DEFAULT '{}',
        "expires_at" TIMESTAMP,
        "revoked_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_oauth_provider_tokens_oauth_account_id" ON "oauth_provider_tokens" ("oauth_account_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_sessions" (
        "id" SERIAL PRIMARY KEY,
        "user_id" int NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "session_uuid" uuid NOT NULL DEFAULT gen_random_uuid(),
        "refresh_token_hash" varchar(128) NOT NULL,
        "ip_hash" varchar(128),
        "user_agent_hash" varchar(128),
        "expires_at" TIMESTAMP NOT NULL,
        "revoked_at" TIMESTAMP,
        "last_seen_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_user_sessions_session_uuid" UNIQUE ("session_uuid"),
        CONSTRAINT "UQ_user_sessions_refresh_token_hash" UNIQUE ("refresh_token_hash")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_user_sessions_user_id" ON "user_sessions" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "jwt_signing_keys" (
        "id" SERIAL PRIMARY KEY,
        "kid" varchar(120) NOT NULL,
        "alg" varchar(32) NOT NULL DEFAULT 'EdDSA',
        "public_key_pem" text NOT NULL,
        "private_key_file" text,
        "active" boolean NOT NULL DEFAULT true,
        "not_before" TIMESTAMP NOT NULL DEFAULT now(),
        "retired_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_jwt_signing_keys_kid" UNIQUE ("kid")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "jwt_signing_keys" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_sessions" CASCADE`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "oauth_provider_tokens" CASCADE`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "oauth_accounts" CASCADE`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "password_credentials" CASCADE`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_emails" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "anonymous_creation_quotas" CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "anonymous_sessions" CASCADE`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "principals" CASCADE`);
  }
}
