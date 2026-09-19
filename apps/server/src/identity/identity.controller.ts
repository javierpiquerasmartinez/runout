import { Controller, Get, Headers, Post } from '@nestjs/common';
import { bearerToken } from './bearer-token.js';
import { IdentityService, type Identity } from './identity.service.js';

@Controller('identities')
export class IdentityController {
  constructor(private readonly identities: IdentityService) {}

  /** First visit: a new anonymous identity and the token the browser keeps. */
  @Post()
  issue(): Promise<{ token: string; identity: Identity }> {
    return this.identities.issue();
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string): Promise<Identity> {
    return this.identities.authenticate(bearerToken(authorization));
  }
}
