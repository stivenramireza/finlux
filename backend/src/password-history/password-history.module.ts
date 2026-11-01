import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HashingModule } from '../auth/hashing/hashing.module.js';
import { PasswordHistory } from './entities/password-history.entity.js';
import { PasswordHistoryService } from './password-history.service.js';

/**
 * Wires the no-reuse password rule. Provides `PasswordHistoryService` with its
 * repository and the shared bcrypt `HashingService` (via `HashingModule`);
 * `ConfigService` comes from the global `ConfigModule`. It deliberately does
 * NOT import `UsersModule` (the current password lives in `password_history`),
 * so there is no cycle with auth/users.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PasswordHistory]), HashingModule],
  providers: [PasswordHistoryService],
  exports: [PasswordHistoryService],
})
export class PasswordHistoryModule {}
