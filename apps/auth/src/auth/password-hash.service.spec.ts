import { describe, expect, it } from 'vitest';
import { PasswordHashService } from './password-hash.service';

describe('PasswordHashService', () => {
  it('hashes and verifies a password with argon2id', async () => {
    const service = new PasswordHashService();

    const hash = await service.hash('CorrectHorseBatteryStaple!23');

    expect(hash).not.toBe('CorrectHorseBatteryStaple!23');
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(
      service.verify(hash, 'CorrectHorseBatteryStaple!23'),
    ).resolves.toBe(true);
    await expect(service.verify(hash, 'wrong-password')).resolves.toBe(false);
  });
});
