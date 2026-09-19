import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import { IdentityService } from '../identity/identity.service.js';
import type { Discarded } from '../hands/import/import.js';
import { QueueService } from './queue.service.js';
import { RoomGateway } from './room.gateway.js';
import { RoomsService, type RoomSummary } from './rooms.service.js';

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly identities: IdentityService,
    private readonly rooms: RoomsService,
    private readonly queue: QueueService,
    private readonly gateway: RoomGateway,
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

  /**
   * Imports pasted Hand History text into the Room's Queue. The new Queue
   * Entries reach every Participant over the WebSocket, the Importer included.
   */
  @Post(':code/hands')
  async paste(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
    @Body() body: { text?: unknown } = {},
  ): Promise<{ imported: number; discarded: Discarded[] }> {
    const importer = await this.identities.authenticate(
      bearerToken(authorization),
    );
    const { room, entries, discarded } = await this.queue.paste(
      importer,
      code,
      body.text,
    );
    if (entries.length > 0) {
      this.gateway.publish(room.id, 'queue.entriesAdded', { entries });
    }
    return { imported: entries.length, discarded };
  }
}
