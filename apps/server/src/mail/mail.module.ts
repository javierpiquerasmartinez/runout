import { Global, Module } from '@nestjs/common';
import { EmailWriter } from './emails.js';
import {
  FRONTEND_URL,
  MAILER,
  frontendUrlFromEnv,
  mailerFromEnv,
  type Mailer,
} from './mailer.js';

@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      useFactory: (): Mailer => mailerFromEnv(process.env),
    },
    {
      provide: FRONTEND_URL,
      useFactory: (): string => frontendUrlFromEnv(process.env),
    },
    EmailWriter,
  ],
  exports: [MAILER, EmailWriter],
})
export class MailModule {}
