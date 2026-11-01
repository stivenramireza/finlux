import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../../users/users.module.js';
import { PasswordHistoryModule } from '../../password-history/password-history.module.js';
import { HashingModule } from '../hashing/hashing.module.js';
import { PasswordResetToken } from './entities/password-reset-token.entity.js';
import { PasswordResetService } from './password-reset.service.js';

/**
 * Wires the forgot-password flow. Provides `PasswordResetService` with the
 * token repository, `UsersService` (blind-index lookup + password update), the
 * shared bcrypt `HashingService` (via `HashingModule`), the no-reuse
 * `PasswordHistoryService`, and the globally-provided `MAILER`. `CryptoService`
 * comes from the global `CryptoModule`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PasswordResetToken]),
    UsersModule,
    HashingModule,
    PasswordHistoryModule,
  ],
  providers: [PasswordResetService],
  exports: [PasswordResetService],
})
export class PasswordResetModule {}
