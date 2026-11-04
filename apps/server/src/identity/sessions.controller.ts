import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { bearerToken } from './bearer-token.js';
import { IdentityService, type SignedIn } from './identity.service.js';
import type { InvitationStatus } from './invitations.js';
import { passwordProblem, type PasswordProblem } from './password-rules.js';
import { COMMON_PASSWORDS } from './passwords.js';
import { InvitationsService } from './invitations.service.js';

/** Signing in with Google or a password, and out again (ADR 0005, ADR 0008). */
@Controller('sessions')
export class SessionsController {
  constructor(private readonly identities: IdentityService) {}

  /**
   * Trades the ID token Google Identity Services gave the browser for the
   * bearer token the rest of the app uses. A browser inside a Room as
   * anonymous presents that identity's token: the Account takes its place.
   */
  @Post('google')
  signInWithGoogle(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { idToken?: unknown } = {},
  ): Promise<SignedIn> {
    return this.identities.signInWithGoogle(
      body.idToken,
      bearerToken(authorization),
    );
  }

  /** Signs in with an email and its password. */
  @Post('password')
  signInWithPassword(
    @Body() body: { email?: unknown; password?: unknown } = {},
  ): Promise<SignedIn> {
    return this.identities.signInWithPassword(body.email, body.password);
  }

  /**
   * Signs this browser out: its token stops working. An Impersonation's
   * Sign-in ends the Impersonation ("Salir").
   */
  @Delete('current')
  @HttpCode(HttpStatus.NO_CONTENT)
  signOut(@Headers('authorization') authorization?: string): Promise<void> {
    return this.identities.signOut(bearerToken(authorization));
  }
}

/** Choosing a new password from an emailed link. */
@Controller('password-resets')
export class PasswordResetsController {
  constructor(private readonly identities: IdentityService) {}

  /** Sends a reset link to that email if it has an Account; the answer never says. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async request(
    @Body() body: { email?: unknown } = {},
  ): Promise<{ accepted: true }> {
    await this.identities.requestPasswordReset(body.email);
    return { accepted: true };
  }

  /** Sets the new password; every other Sign-in ends and this browser is signed in. */
  @Post(':token')
  complete(
    @Param('token') token: string,
    @Body() body: { password?: unknown } = {},
  ): Promise<SignedIn> {
    return this.identities.completePasswordReset(token, body.password);
  }
}

/** An Invitation's link, as the person it was sent to opens it. */
@Controller('invitations')
export class InvitationLinksController {
  constructor(
    private readonly identities: IdentityService,
    private readonly invitations: InvitationsService,
  ) {}

  /** The invited email and the Invitation's status, before anything is submitted. */
  @Get(':token')
  find(
    @Param('token') token: string,
  ): Promise<{ email: string; status: InvitationStatus }> {
    return this.invitations.byToken(token);
  }

  /** Accepts it by choosing a password. */
  @Post(':token/password')
  acceptWithPassword(
    @Param('token') token: string,
    @Body() body: { password?: unknown } = {},
  ): Promise<SignedIn> {
    return this.identities.acceptWithPassword(token, body.password);
  }

  /** Accepts it with the Google account of the invited email. */
  @Post(':token/google')
  acceptWithGoogle(
    @Param('token') token: string,
    @Body() body: { idToken?: unknown } = {},
  ): Promise<SignedIn> {
    return this.identities.acceptWithGoogle(token, body.idToken);
  }
}

/**
 * The password rules, for the web to warn while someone types: the bundled
 * list of common passwords stays on the server, which decides in the end.
 */
@Controller('password-checks')
export class PasswordChecksController {
  @Post()
  @HttpCode(HttpStatus.OK)
  check(@Body() body: { password?: unknown } = {}): {
    problem: PasswordProblem | null;
  } {
    const password = typeof body.password === 'string' ? body.password : '';
    return { problem: passwordProblem(password, COMMON_PASSWORDS) };
  }
}
