import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';

// Mock bcrypt so we can assert the cost factor the dummy hash is generated at,
// without relying on ESM export spying (which is not configurable).
const hashMock = vi.fn<(plain: string, cost: number) => Promise<string>>(
  (plain, cost) =>
    Promise.resolve(`$2b$${String(cost).padStart(2, '0')}$hashed`),
);
const compareMock = vi.fn<(plain: string, hash: string) => Promise<boolean>>(
  () => Promise.resolve(false),
);

vi.mock('bcrypt', () => ({
  hash: (plain: string, cost: number) => hashMock(plain, cost),
  compare: (plain: string, hash: string) => compareMock(plain, hash),
}));

// Imported after the mock is registered (vi.mock is hoisted anyway).
const { HashingService } = await import('./hashing.service.js');

function makeService(
  saltRounds?: string | number,
): InstanceType<typeof HashingService> {
  const configService = {
    get: (key: string) =>
      key === 'BCRYPT_SALT_ROUNDS' ? saltRounds : undefined,
  } as unknown as ConfigService;
  return new HashingService(configService);
}

describe('HashingService.compareWithDummy cost tracking', () => {
  beforeEach(() => {
    hashMock.mockClear();
    compareMock.mockClear();
  });

  it('generates the dummy hash at the configured cost and returns false', async () => {
    const svc = makeService(7);
    await expect(svc.compareWithDummy('anything')).resolves.toBe(false);

    expect(hashMock).toHaveBeenCalledTimes(1);
    expect(hashMock).toHaveBeenCalledWith(expect.any(String), 7);
    // The dummy plaintext is a fixed non-secret sentinel, not the input.
    expect(hashMock.mock.calls[0][0]).not.toBe('anything');
    expect(compareMock).toHaveBeenCalledWith('anything', '$2b$07$hashed');
  });

  it('falls back to the default cost (12) when config is invalid', async () => {
    const svc = makeService('not-a-number');
    await svc.compareWithDummy('anything');
    expect(hashMock).toHaveBeenCalledWith(expect.any(String), 12);
  });

  it('caches the dummy hash (one bcrypt.hash across calls)', async () => {
    const svc = makeService(7);
    await svc.compareWithDummy('a');
    await svc.compareWithDummy('b');
    expect(hashMock).toHaveBeenCalledTimes(1);
    expect(compareMock).toHaveBeenCalledTimes(2);
  });
});
