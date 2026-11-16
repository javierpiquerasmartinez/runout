import { Module } from '@nestjs/common';
import {
  ADMINISTRATOR_EMAILS,
  administratorEmailsFromEnv,
  type AdministratorEmails,
} from './administrators.js';

/**
 * Who the Administrators are, from the server's configuration (ADR 0008):
 * read in this one place, for every module that asks.
 */
@Module({
  providers: [
    {
      provide: ADMINISTRATOR_EMAILS,
      useFactory: (): AdministratorEmails =>
        administratorEmailsFromEnv(process.env),
    },
  ],
  exports: [ADMINISTRATOR_EMAILS],
})
export class AdministratorsModule {}
