import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CryptoService } from './crypto.service.js';

/**
 * Global module exposing {@link CryptoService} app-wide (so any feature can
 * compute the email blind index / normalize without re-importing). Imported
 * once in `AppModule`.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
