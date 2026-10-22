import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import {
  IdentityService,
  type SignedIn,
} from '../identity/identity.service.js';
import type { Discarded } from '../hands/import/import.js';
import { QueueService } from './queue.service.js';
import { RoomGateway } from './room.gateway.js';
import { RoomsService, type RoomSummary } from './rooms.service.js';

/** An open Room someone has been in, as the welcome screen lists it. */
interface OpenRoomView extends RoomSummary {
  /** Whether anyone is connected to it right now. */
  live: boolean;
  /** When they first arrived in it, kept across rejoins, as an ISO instant. */
  joinedAt: string;
}

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
    // Every Room starts with a lasting Master (ADR 0005).
    const creator = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    const room = await this.rooms.create(creator, {
      name: body.name,
      displayName: body.displayName,
    });
    // Its abandonment period starts now: a Room nobody ever joins still closes.
    this.gateway.roomOpened(room.id);
    return { code: room.code, name: room.name };
  }

  /**
   * The open Rooms this Account has been in, the most recently joined first,
   * for the welcome screen. Closed Rooms and Rooms they were kicked from are
   * left out. An anonymous identity has only its own Room: `account-required`.
   */
  @Get()
  async mine(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<OpenRoomView[]> {
    const identity = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    const open = await this.rooms.openRoomsOf(identity.id);
    return open.map((room) => ({
      code: room.code,
      name: room.name,
      live: this.gateway.isLive(room.id),
      joinedAt: room.joinedAt.toISOString(),
    }));
  }

  /**
   * Lets the web check a typed code, and name the Room, before joining. Who
   * has no identity yet may look too: joining is what issues one.
   */
  @Get(':code')
  async find(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
  ): Promise<RoomSummary> {
    const token = bearerToken(authorization);
    const room = token
      ? await this.rooms.findOpenFor(
          await this.identities.authenticate(token),
          code,
        )
      : await this.rooms.findOpen(code);
    return { code: room.code, name: room.name };
  }

  /**
   * Someone without an Account joins the Room: a new anonymous identity for
   * this Room only, under the Display Name they chose (ADR 0005). Joining a
   * second Room this way issues another.
   */
  @Post(':code/guests')
  async joinAnonymously(
    @Param('code') code: string,
    @Body() body: { displayName?: unknown } = {},
  ): Promise<SignedIn> {
    const room = await this.rooms.findOpen(code);
    return this.identities.issueAnonymous(room.id, body.displayName);
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
    if (entries.length > 0) await this.gateway.entriesAdded(room.id, entries);
    return { imported: entries.length, discarded };
  }

  /**
   * Adds Hands of the sender's own Library to the end of the Room's Queue,
   * as themselves, all of them or none. Only an Account has a Library:
   * `account-required` otherwise. The new Queue Entries reach every
   * Participant over the WebSocket.
   */
  @Post(':code/library-hands')
  async addFromLibrary(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
    @Body() body: { handIds?: unknown } = {},
  ): Promise<{ added: number }> {
    const sender = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    const { room, entries } = await this.queue.addFromLibrary(
      sender,
      code,
      body.handIds,
    );
    if (entries.length > 0) await this.gateway.entriesAdded(room.id, entries);
    return { added: entries.length };
  }
}
