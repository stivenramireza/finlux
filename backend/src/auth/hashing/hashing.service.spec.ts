import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { HashingService } from './hashing.service.js';

function makeService(saltRounds?: string | number): HashingService {
  const configService = {
    get: (key: string) =>
      key === 'BCRYPT_SALT_ROUNDS' ? saltRounds : undefined,
  } as unknown as ConfigService;
  return new HashingService(configService);
}

describe('HashingService', () => {
  // Use a low cost in tests (defaulting to 12 would slow the suite).
  const service = makeService(4);

  it('produces a hash that differs from the plaintext', async () => {
    const hash = await service.hash('Str0ng!Pass');
    expect(hash).not.toBe('Str0ng!Pass');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('produces different hashes for the same password (per-hash salt)', async () => {
    const a = await service.hash('Str0ng!Pass');
    const b = await service.hash('Str0ng!Pass');
    expect(a).not.toBe(b);
  });

  it('compare returns true for the correct password', async () => {
    const hash = await service.hash('Str0ng!Pass');
    await expect(service.compare('Str0ng!Pass', hash)).resolves.toBe(true);
  });

  it('compare returns false for a wrong password', async () => {
    const hash = await service.hash('Str0ng!Pass');
    await expect(service.compare('wrong-password', hash)).resolves.toBe(false);
  });

  it('falls back to the default cost when the config value is invalid', async () => {
    const svc = makeService('not-a-number');
    const hash = await svc.hash('Str0ng!Pass');
    expect(hash.startsWith('$2b$12$')).toBe(true);
  });
});
