import { Body, Controller, Get, Headers, Post, Put } from '@nestjs/common';
import { bearerToken } from './bearer-token.js';
import { IdentityService, type Profile } from './identity.service.js';

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
}
