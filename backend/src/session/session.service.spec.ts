import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SessionService } from './session.service.js';
import { Session } from './entities/session.entity.js';

describe('SessionService (audit rows)', () => {
  let service: SessionService;
  let repo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    repo = {
      create: vi.fn((data: Partial<Session>) => data as Session),
      save: vi.fn((data: Partial<Session>) => Promise.resolve(data as Session)),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: getRepositoryToken(Session), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(SessionService);
  });

  it('stores the SHA-256 hash of the token, never the raw token', async () => {
    const rawToken = 'header.payload.signature';
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    await service.record('user-1', rawToken, expiresAt);

    const expectedHash = createHash('sha256').update(rawToken).digest('hex');
    expect(repo.create).toHaveBeenCalledWith({
      userId: 'user-1',
      token: expectedHash,
      expiresAt,
    });
    const saved = repo.save.mock.calls[0][0] as Session;
    expect(saved.token).not.toBe(rawToken);
    expect(saved.token).toBe(expectedHash);
  });

  it('hashToken is a stable SHA-256 hex digest', () => {
    expect(SessionService.hashToken('abc')).toBe(
      createHash('sha256').update('abc').digest('hex'),
    );
  });
});
