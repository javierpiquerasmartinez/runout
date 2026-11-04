import { Module } from '@nestjs/common';
import { googleVerifierFromEnv } from './dev-sign-in.js';
import { GOOGLE_VERIFIER, type GoogleVerifier } from './google-verifier.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { SessionsController } from './sessions.controller.js';

@Module({
  controllers: [IdentityController, SessionsController],
  providers: [
    {
      provide: GOOGLE_VERIFIER,
      useFactory: (): GoogleVerifier => googleVerifierFromEnv(process.env),
    },
    IdentityService,
  ],
  exports: [IdentityService],
})
export class IdentityModule {}
