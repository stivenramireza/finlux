import { Module } from '@nestjs/common';
import { HashingService } from './hashing.service.js';

/**
 * Provides the bcrypt `HashingService` as a single shared provider, so modules
 * that need password hashing/compare (auth, password-reset, password-history)
 * import it instead of each providing `HashingService` by value. Removes the
 * by-value duplication and keeps a single instance.
 */
@Module({
  providers: [HashingService],
  exports: [HashingService],
})
export class HashingModule {}
