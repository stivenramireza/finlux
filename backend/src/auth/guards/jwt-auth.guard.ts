import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guards endpoints that read or write financial data. Requests without a valid
 * JWT are rejected with 401 (Requirement 4.3). Apply with `@UseGuards(JwtAuthGuard)`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
