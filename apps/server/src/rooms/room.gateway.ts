import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type WsResponse,
} from '@nestjs/websockets';
import type { IncomingMessage } from 'node:http';
import { WebSocket } from 'ws';
import {
  IdentityService,
  type Identity,
} from '../identity/identity.service.js';
import { Rejected, type RejectionReason } from '../rejection/rejection.js';
import { QueueService, type QueueEntry } from './queue.service.js';
import { RoomPresence, type Participant } from './room-presence.js';
import { RoomsService, type RoomSummary } from './rooms.service.js';

export interface JoinCommand {
  code: string;
  displayName: string;
}

export interface RoomSnapshot {
  room: RoomSummary;
  /** The identity id of the Participant receiving the snapshot. */
  you: string;
  participants: Participant[];
  queue: QueueEntry[];
}

export interface RejectedEvent {
  command: string;
  reason: RejectionReason;
}

/**
 * Room commands and events over `/ws`. The socket presents its identity token
 * in the URL (`/ws?token=…`), since browsers can't set headers on a WebSocket.
 */
@WebSocketGateway({ path: '/ws' })
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RoomGateway.name);
  private readonly identityOf = new WeakMap<WebSocket, Promise<Identity>>();
  private readonly presence = new RoomPresence<WebSocket>();

  constructor(
    private readonly identities: IdentityService,
    private readonly rooms: RoomsService,
    private readonly queue: QueueService,
  ) {}

  handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const token =
      new URL(request.url ?? '/', 'ws://localhost').searchParams.get('token') ??
      undefined;
    const identity = this.identities.authenticate(token);
    // Rejection is reported when the socket sends its first command.
    identity.catch(() => {});
    this.identityOf.set(socket, identity);
  }

  handleDisconnect(socket: WebSocket): void {
    this.leave(socket);
  }

  @SubscribeMessage('room.join')
  join(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() command: Partial<JoinCommand> | null,
  ): Promise<WsResponse<RoomSnapshot | RejectedEvent> | undefined> {
    return this.rejecting('room.join', async () => {
      const identity = await this.authenticated(socket);
      const { room, participant } = await this.rooms.join(
        identity,
        String(command?.code ?? ''),
        command?.displayName,
      );
      const queue = await this.queue.entries(room.id);
      if (socket.readyState !== WebSocket.OPEN) return undefined;

      this.leave(socket);
      const arrived = this.presence.enter(
        room.id,
        room.masterId,
        participant,
        socket,
      );
      if (arrived) {
        this.broadcast(room.id, identity.id, 'room.participantJoined', {
          participant: this.presence.participant(room.id, identity.id),
        });
      }
      return {
        event: 'room.snapshot',
        data: {
          room: { code: room.code, name: room.name },
          you: identity.id,
          participants: this.presence.participants(room.id),
          queue,
        },
      };
    });
  }

  @SubscribeMessage('room.leave')
  leaveRoom(
    @ConnectedSocket() socket: WebSocket,
  ): Promise<WsResponse<RejectedEvent> | undefined> {
    return this.rejecting('room.leave', async () => {
      await this.authenticated(socket);
      if (!this.presence.isInRoom(socket)) throw new Rejected('not-in-room');
      this.leave(socket);
      return undefined;
    });
  }

  private leave(socket: WebSocket): void {
    const left = this.presence.exit(socket);
    if (left) {
      this.broadcast(left.roomId, left.identityId, 'room.participantLeft', {
        identityId: left.identityId,
      });
    }
  }

  private async authenticated(socket: WebSocket): Promise<Identity> {
    const identity = this.identityOf.get(socket);
    if (!identity) throw new Rejected('unauthenticated');
    return identity;
  }

  /** Sends an event to every connection in the Room. */
  publish(roomId: string, event: string, data: unknown): void {
    this.broadcast(roomId, undefined, event, data);
  }

  private broadcast(
    roomId: string,
    exceptIdentityId: string | undefined,
    event: string,
    data: unknown,
  ): void {
    const message = JSON.stringify({ event, data });
    for (const socket of this.presence.connections(roomId, exceptIdentityId)) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  }

  /** Runs a command, replying `rejected` with its reason when the domain refuses it. */
  private async rejecting<T>(
    command: string,
    run: () => Promise<WsResponse<T> | undefined>,
  ): Promise<WsResponse<T | RejectedEvent> | undefined> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Rejected) {
        return { event: 'rejected', data: { command, reason: error.reason } };
      }
      this.logger.error(error);
      throw error;
    }
  }
}
