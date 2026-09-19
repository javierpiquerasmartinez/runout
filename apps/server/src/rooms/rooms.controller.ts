import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import { IdentityService } from '../identity/identity.service.js';
import { RoomsService, type RoomSummary } from './rooms.service.js';

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly identities: IdentityService,
    private readonly rooms: RoomsService,
  ) {}

  @Post()
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { name?: unknown; displayName?: unknown } = {},
  ): Promise<RoomSummary> {
    const creator = await this.identities.authenticate(
      bearerToken(authorization),
    );
    return this.rooms.create(creator, {
      name: body.name,
      displayName: body.displayName,
    });
  }

  /** Lets the web check a typed code, and name the Room, before joining. */
  @Get(':code')
  async find(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
  ): Promise<RoomSummary> {
    await this.identities.authenticate(bearerToken(authorization));
    const room = await this.rooms.findOpen(code);
    return { code: room.code, name: room.name };
  }
}
