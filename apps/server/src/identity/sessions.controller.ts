import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { bearerToken } from './bearer-token.js';
import { IdentityService, type SignedIn } from './identity.service.js';

/** Signing in with Google and out again (ADR 0005). */
@Controller('sessions')
export class SessionsController {
  constructor(private readonly identities: IdentityService) {}

  /**
   * Trades the ID token Google Identity Services gave the browser for the
   * bearer token the rest of the app uses.
   */
  @Post('google')
  signInWithGoogle(
    @Body() body: { idToken?: unknown } = {},
  ): Promise<SignedIn> {
    return this.identities.signInWithGoogle(body.idToken);
  }

  /** Signs this browser out: its token stops working. */
  @Delete('current')
  @HttpCode(HttpStatus.NO_CONTENT)
  signOut(@Headers('authorization') authorization?: string): Promise<void> {
    return this.identities.signOut(bearerToken(authorization));
  }
}
