import { Global, Module } from '@nestjs/common';
import { MAILER } from './mailer.port.js';
import { ResendMailer } from './resend.mailer.js';

/**
 * Provides the outbound-email port (`MAILER`) backed by Resend. Global so any
 * feature that needs to send mail can inject `MAILER` without re-importing.
 */
@Global()
@Module({
  providers: [{ provide: MAILER, useClass: ResendMailer }],
  exports: [MAILER],
})
export class MailModule {}
