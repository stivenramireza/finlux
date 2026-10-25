import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtStrategy } from '../strategies/jwt.strategy.js';
import type { UsersService } from '../../users/users.service.js';

const JWT_SECRET = 'test-secret';

function makeContext(headers: Record<string, string>): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwt: JwtService;
  let usersService: { findById: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    usersService = { findById: vi.fn() };
    const configService = {
      get: (key: string) => (key === 'JWT_SECRET' ? JWT_SECRET : undefined),
    } as unknown as ConfigService;

    // Instantiate the strategy so passport registers the 'jwt' strategy that
    // AuthGuard('jwt') resolves at runtime.
    new JwtStrategy(configService, usersService as unknown as UsersService);

    jwt = new JwtService({ secret: JWT_SECRET });
    guard = new JwtAuthGuard();
  });

  it('rejects a request with no Authorization header', async () => {
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a request with an invalid token', async () => {
    const ctx = makeContext({ authorization: 'Bearer not-a-valid-jwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('allows a request with a valid token for an existing user', async () => {
    usersService.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    const token = jwt.sign(
      { sub: 'user-1', email: 'user@example.com' },
      { secret: JWT_SECRET, expiresIn: '1h' },
    );
    const ctx = makeContext({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects a valid token when the user no longer exists', async () => {
    usersService.findById.mockResolvedValue(null);
    const token = jwt.sign(
      { sub: 'ghost', email: 'ghost@example.com' },
      { secret: JWT_SECRET, expiresIn: '1h' },
    );
    const ctx = makeContext({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
