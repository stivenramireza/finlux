import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initCryptoKeys } from './crypto-keys.js';
import { blindIndex, decrypt, encrypt, normalizeEmail } from './crypto.js';

/**
 * Injectable wrapper over the framework-free crypto primitives, for services
 * that need to compute the email blind index or normalize an email
 * (`UsersService`, `AuthService`).
 *
 * The constructor initializes the process-level keys from `ConfigService`
 * (idempotent — safe alongside the `main.ts` bootstrap call), so the same keys
 * back both the DI path and the entity transformer. Fail-fast on a
 * missing/invalid key is inherited from `initCryptoKeys`.
 */
@Injectable()
export class CryptoService {
  constructor(private readonly configService: ConfigService) {
    initCryptoKeys((name) => this.configService.get<string>(name));
  }

  encrypt(plaintext: string): string {
    return encrypt(plaintext);
  }

  decrypt(envelope: string): string {
    return decrypt(envelope);
  }

  blindIndex(normalized: string): string {
    return blindIndex(normalized);
  }

  normalizeEmail(email: string): string {
    return normalizeEmail(email);
  }
}
