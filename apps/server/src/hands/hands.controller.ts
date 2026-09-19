import { Controller, Get, Header, Headers, Param } from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import { IdentityService } from '../identity/identity.service.js';
import { HandsService, type HandWithTimeline } from './hands.service.js';

@Controller('hands')
export class HandsController {
  constructor(
    private readonly identities: IdentityService,
    private readonly hands: HandsService,
  ) {}

  /**
   * A Hand with its Timeline. The web keeps each one for the page's life, so
   * Playback events only carry the Hand's id. The Timeline is derived on
   * demand and its shape may change with a deploy, so browsers don't keep it.
   */
  @Get(':id')
  @Header('Cache-Control', 'private, no-cache')
  async find(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<HandWithTimeline> {
    const viewer = await this.identities.authenticate(
      bearerToken(authorization),
    );
    return this.hands.withTimeline(viewer, id);
  }
}
