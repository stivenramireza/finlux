import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../strategies/jwt.strategy.js';

/**
 * Extracts the authenticated principal (resolved by `JwtStrategy`) from the
 * request. With no argument it returns the whole `AuthenticatedUser`; passing a
 * key (e.g. `@CurrentUser('userId')`) returns just that field.
 *
 * Only meaningful on routes protected by `JwtAuthGuard`.
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthenticatedUser | undefined,
    ctx: ExecutionContext,
  ): AuthenticatedUser | string => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();
    const user = request.user;
    return data ? user[data] : user;
  },
);
