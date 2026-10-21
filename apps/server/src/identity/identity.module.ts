import { Module } from '@nestjs/common';
import {
  GOOGLE_VERIFIER,
  GoogleIdTokenVerifier,
  type GoogleVerifier,
} from './google-verifier.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { SessionsController } from './sessions.controller.js';

@Module({
  controllers: [IdentityController, SessionsController],
  providers: [
    {
      provide: GOOGLE_VERIFIER,
      useFactory: (): GoogleVerifier => {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
          throw new Error(
            'GOOGLE_CLIENT_ID is not set. See the README for how to get one for signing in with Google.',
          );
        }
        return new GoogleIdTokenVerifier(clientId);
      },
    },
    IdentityService,
  ],
  exports: [IdentityService],
})
export class IdentityModule {}
