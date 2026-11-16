import { Module } from '@nestjs/common';
import {
  ADMINISTRATOR_EMAILS,
  administratorEmailsFromEnv,
  type AdministratorEmails,
} from './administrators.js';
import { googleVerifierFromEnv } from './dev-sign-in.js';
import { GOOGLE_VERIFIER, type GoogleVerifier } from './google-verifier.js';
import { IdentityController } from './identity.controller.js';
import { PlansModule } from '../plans/plans.module.js';
import { IdentityService } from './identity.service.js';
import { InvitationsService } from './invitations.service.js';
import {
  InvitationLinksController,
  PasswordChecksController,
  PasswordResetsController,
  SessionsController,
} from './sessions.controller.js';

@Module({
  imports: [PlansModule],
  controllers: [
    IdentityController,
    SessionsController,
    PasswordResetsController,
    InvitationLinksController,
    PasswordChecksController,
  ],
  providers: [
    {
      provide: GOOGLE_VERIFIER,
      useFactory: (): GoogleVerifier => googleVerifierFromEnv(process.env),
    },
    {
      provide: ADMINISTRATOR_EMAILS,
      useFactory: (): AdministratorEmails =>
        administratorEmailsFromEnv(process.env),
    },
    IdentityService,
    InvitationsService,
  ],
  exports: [IdentityService, InvitationsService, ADMINISTRATOR_EMAILS],
})
export class IdentityModule {}
