import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import {
  IdentityService,
  refuseImpersonation,
  type SignedIn,
} from '../identity/identity.service.js';
import type { Discarded } from '../hands/import/import.js';
import { QueueService } from './queue.service.js';
import { RoomGateway } from './room.gateway.js';
import { RoomsService, type RoomSummary } from './rooms.service.js';

/** An open Room someone is a Participant of, as their list of Rooms shows it. */
interface OpenRoomView extends RoomSummary {
  state: 'free-review' | 'live';
  /** What they are in it. */
  role: 'master' | 'guest';
  /** Active Queue Entries. */
  hands: number;
  /** How many Participants are connected to it right now. */
  connected: number;
  /** Its Participants, connected or not. */
  participants: number;
  /** As an ISO instant. */
  lastActivityAt: string;
  /** The Master's Display Name. */
  master: string;
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
    // Nobody in a live session may see someone who isn't there (ADR 0008).
    refuseImpersonation(creator);
    const room = await this.rooms.create(creator, {
      name: body.name,
      displayName: body.displayName,
    });
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
      state: room.state,
      role: room.masterId === identity.id ? 'master' : 'guest',
      hands: room.hands,
      connected: this.gateway.connectedCount(room.id),
      participants: room.participants,
      lastActivityAt: room.lastActivityAt.toISOString(),
      master: room.masterName,
      joinedAt: room.joinedAt.toISOString(),
    }));
  }

  /** The Master renames the Room; everyone in it sees the new name at once. */
  @Patch(':code')
  async rename(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
    @Body() body: { name?: unknown } = {},
  ): Promise<RoomSummary> {
    const master = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    refuseImpersonation(master);
    const room = await this.rooms.rename(master, code, body.name);
    this.gateway.roomRenamed(room.id, room.name);
    return { code: room.code, name: room.name };
  }

  /** The Master closes the Room from outside it, exactly as from inside. */
  @Post(':code/close')
  @HttpCode(204)
  async close(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
  ): Promise<void> {
    const master = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    refuseImpersonation(master);
    const room = await this.rooms.findOpen(code);
    await this.rooms.close(master, room.id);
    this.gateway.closedByMaster(room.id);
  }

  /** A Guest Leaves the Room: it is off their list, and any tab of theirs in it is taken out. */
  @Delete(':code/membership')
  @HttpCode(204)
  async leave(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
  ): Promise<void> {
    const guest = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    refuseImpersonation(guest);
    const room = await this.rooms.leave(guest, code);
    this.gateway.participantLeft(room.id, guest.id);
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
    const identity = token ? await this.identities.authenticate(token) : null;
    if (identity) refuseImpersonation(identity);
    const room = identity
      ? await this.rooms.findOpenFor(identity, code)
      : await this.rooms.findOpen(code);
    return { code: room.code, name: room.name };
  }

  /**
   * How many Hands in the Queue are in nobody's Library, and would be lost
   * with their Notes if the Room closed now. The Master's alone to ask.
   */
  @Get(':code/room-hands')
  async roomHandsCount(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
  ): Promise<{ count: number }> {
    const master = await this.identities.authenticate(
      bearerToken(authorization),
    );
    return { count: await this.rooms.roomHandsCount(master, code) };
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
