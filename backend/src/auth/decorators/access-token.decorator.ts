import {
  createParamDecorator,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Extracts the raw bearer JWT from the `Authorization` header of a request
 * already validated by `JwtAuthGuard`. Used alongside `@CurrentUser('userId')`
 * so the conversational agent can forward the caller's own token to the
 * transaction API (`Authorization: Bearer`) — the API is the sole ownership
 * authority.
 *
 * Only meaningful on routes protected by `JwtAuthGuard`; the guard has already
 * verified the token's signature and expiry by the time this runs.
 */
export const AccessToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header) {
      // Should not happen behind JwtAuthGuard, but never proceed without it.
      throw new UnauthorizedException();
    }
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException();
    }
    return token;
  },
);
