import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { bearerToken } from './bearer-token.js';
import {
  IdentityService,
  type Preferences,
  type Profile,
} from './identity.service.js';

@Controller('identities')
export class IdentityController {
  constructor(private readonly identities: IdentityService) {}

  /** First visit: a new anonymous identity and the token the browser keeps. */
  @Post()
  issue(): Promise<{ token: string; identity: Profile }> {
    return this.identities.issue();
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string): Promise<Profile> {
    return this.identities.profile(
      await this.identities.authenticate(bearerToken(authorization)),
    );
  }

  /** Replaces the Screen Names Hands are matched against. */
  @Put('me/screen-names')
  async setScreenNames(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { screenNames?: unknown } = {},
  ): Promise<Profile> {
    return this.identities.setScreenNames(
      await this.identities.authenticate(bearerToken(authorization)),
      body.screenNames,
    );
  }

  /**
   * Changes the Display Name. Every Room the person is in right now shows the
   * new one at once.
   */
  @Put('me/display-name')
  async setDisplayName(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { displayName?: unknown } = {},
  ): Promise<Profile> {
    const identity = await this.identities.authenticate(
      bearerToken(authorization),
    );
    return this.identities.profile(
      await this.identities.setDisplayName(identity.id, body.displayName),
    );
  }

  /** Changes some preferences; the ones left out stay as they were. */
  @Patch('me/preferences')
  async changePreferences(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): Promise<Preferences> {
    return this.identities.changePreferences(
      await this.identities.authenticate(bearerToken(authorization)),
      body,
    );
  }
}
