import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebBotAuthService } from './web-bot-auth.service';

describe('WebBotAuthService', () => {
  let service: WebBotAuthService;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    service = new WebBotAuthService();
    // Save env vars we may modify
    savedEnv.WEB_BOT_AUTH_ENABLED = process.env.WEB_BOT_AUTH_ENABLED;
    savedEnv.WEB_BOT_AUTH_SEED = process.env.WEB_BOT_AUTH_SEED;
    savedEnv.WEB_BOT_AUTH_SIGNATURE_AGENT = process.env.WEB_BOT_AUTH_SIGNATURE_AGENT;
    savedEnv.WEB_BOT_AUTH_KEY_COUNT = process.env.WEB_BOT_AUTH_KEY_COUNT;
    savedEnv.PROXY_COUNT = process.env.PROXY_COUNT;
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  describe('disabled by default', () => {
    it('isEnabled returns false when no env vars set', async () => {
      delete process.env.WEB_BOT_AUTH_ENABLED;
      delete process.env.WEB_BOT_AUTH_SEED;
      await service.onModuleInit();
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('signRequest when disabled', () => {
    it('returns null', async () => {
      delete process.env.WEB_BOT_AUTH_ENABLED;
      await service.onModuleInit();
      const result = await service.signRequest(1, 'GET', 'https://example.com/api');
      expect(result).toBeNull();
    });
  });

  describe('with env vars set', () => {
    beforeEach(async () => {
      process.env.WEB_BOT_AUTH_ENABLED = 'true';
      process.env.WEB_BOT_AUTH_SEED = 'test-seed-for-unit-tests';
      process.env.WEB_BOT_AUTH_SIGNATURE_AGENT =
        'https://bot.example/.well-known/http-message-signatures-directory';
      process.env.WEB_BOT_AUTH_KEY_COUNT = '5';
      await service.onModuleInit();
    });

    it('generates key pairs from seed and is enabled', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('signRequest returns headers with expected keys', async () => {
      const result = await service.signRequest(
        1,
        'POST',
        'https://test-store.myshopify.com/api/2026-04/graphql.json',
      );

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('Signature-Input');
      expect(result).toHaveProperty('Signature');
      expect(result).toHaveProperty('Signature-Agent');
      expect(result!['Signature-Agent']).toBe(
        '"https://bot.example/.well-known/http-message-signatures-directory"',
      );
    });

    it('Signature-Input contains expected structured fields', async () => {
      const result = await service.signRequest(
        1,
        'POST',
        'https://test-store.myshopify.com/api/2026-04/graphql.json',
      );

      expect(result!['Signature-Input']).toMatch(/^sig=/);
      expect(result!['Signature-Input']).toContain('"@method"');
      expect(result!['Signature-Input']).toContain('"@authority"');
      expect(result!['Signature-Input']).toContain('"@path"');
      expect(result!['Signature-Input']).toContain('"signature-agent"');
      expect(result!['Signature-Input']).toContain('alg="ed25519"');
      expect(result!['Signature-Input']).toContain('tag="web-bot-auth"');
    });

    it('Signature follows structured field format sig=:base64:', async () => {
      const result = await service.signRequest(
        1,
        'POST',
        'https://test-store.myshopify.com/api/2026-04/graphql.json',
      );

      expect(result!['Signature']).toMatch(/^sig=:.+:$/);
    });

    it('different proxy numbers produce different signatures', async () => {
      const url = 'https://test-store.myshopify.com/api/2026-04/graphql.json';

      const result1 = await service.signRequest(1, 'POST', url);
      const result2 = await service.signRequest(2, 'POST', url);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      // Different key pairs => different keyIds and signatures
      expect(result1!['Signature']).not.toBe(result2!['Signature']);
      expect(result1!['Signature-Input']).not.toBe(result2!['Signature-Input']);
    });

    it('returns null for proxy number without a key pair', async () => {
      // PROXY_COUNT is 5, so proxy 99 has no key
      const result = await service.signRequest(99, 'POST', 'https://example.com');
      expect(result).toBeNull();
    });
  });

  describe('enabled but missing seed', () => {
    it('disables itself when seed is not set', async () => {
      process.env.WEB_BOT_AUTH_ENABLED = 'true';
      delete process.env.WEB_BOT_AUTH_SEED;
      await service.onModuleInit();
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('enabled but missing signature agent', () => {
    it('disables itself when key directory URL is not set', async () => {
      process.env.WEB_BOT_AUTH_ENABLED = 'true';
      process.env.WEB_BOT_AUTH_SEED = 'test-seed-for-unit-tests';
      delete process.env.WEB_BOT_AUTH_SIGNATURE_AGENT;
      delete process.env.WEB_BOT_AUTH_KEY_DIRECTORY_URL;
      await service.onModuleInit();
      expect(service.isEnabled()).toBe(false);
    });

    it('disables itself when signature agent is not https', async () => {
      process.env.WEB_BOT_AUTH_ENABLED = 'true';
      process.env.WEB_BOT_AUTH_SEED = 'test-seed-for-unit-tests';
      process.env.WEB_BOT_AUTH_SIGNATURE_AGENT =
        'http://bot.example/.well-known/http-message-signatures-directory';
      await service.onModuleInit();
      expect(service.isEnabled()).toBe(false);
    });
  });
});
