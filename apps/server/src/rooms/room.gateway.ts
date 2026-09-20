import { Inject, Logger } from '@nestjs/common';
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
import { CLOCK, type Clock } from '../clock/clock.js';
import {
  IdentityService,
  type Identity,
} from '../identity/identity.service.js';
import { Rejected, type RejectionReason } from '../rejection/rejection.js';
import { MasterFailover } from './master-failover.js';
import { MasterService, type MasterChanged } from './master.service.js';
import { PlaybackService, type Playback } from './playback.service.js';
import { QueueService, type QueueEntry } from './queue.service.js';
import { RoomClosure } from './room-closure.js';
import {
  RoomPresence,
  presenceChanged,
  type Participant,
  type ParticipantPresence,
} from './room-presence.js';
import { RoomRevisions } from './room-revisions.js';
import { RoomsService, type Room, type RoomSummary } from './rooms.service.js';

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
  /** Null while no Hand is loaded. */
  playback: Playback | null;
  /** The revision this snapshot is at. Every later change carries a higher one. */
  revision: number;
  /** How everyone in the Room is following it right now. */
  presence: ParticipantPresence[];
}

export interface HeartbeatCommand {
  /** The client's own clock when it sent this, echoed back so it can time the round trip. */
  sentAt: number;
  /** The last revision of the Room this client has applied. */
  revision: number;
  /** The round trip this client last measured, in ms; null before it has one. */
  latencyMs: number | null;
}

export interface HeartbeatAck {
  sentAt: number;
}

export interface HandOverMasterCommand {
  /** The identity id of the Participant taking the Master role. */
  identityId: string;
}

export interface KickCommand {
  /** The identity id of the Participant being removed from the Room. */
  identityId: string;
}

export interface LoadHandCommand {
  handId: string;
}

export interface GoToActionCommand {
  actionIndex: number;
}

export interface ReassignAuthorCommand {
  handId: string;
  /** The identity id of the new Author. */
  authorId: string;
}

export interface ReorderQueueCommand {
  /** Every active Queue Entry's id, in the new order. */
  order: string[];
}

export interface RemoveQueueEntryCommand {
  id: string;
}

export interface UndoQueueRemovalCommand {
  id: string;
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
  /** The last Playback change of each Room, so changes apply and broadcast in order. */
  private readonly playbackChanges = new Map<string, Promise<unknown>>();
  /** The Rooms waiting for a Master who dropped. */
  private readonly failover: MasterFailover;
  /** The Rooms nobody is connected to, waiting to close themselves. */
  private readonly closure: RoomClosure;
  /** Where each Room is in its own history, so clients can spot what they missed. */
  private readonly revisions = new RoomRevisions();
  /** The last presence each Room was told about, so only real changes travel. */
  private readonly presenceTold = new Map<string, ParticipantPresence[]>();

  constructor(
    private readonly identities: IdentityService,
    private readonly rooms: RoomsService,
    private readonly queue: QueueService,
    private readonly playback: PlaybackService,
    private readonly masters: MasterService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.failover = new MasterFailover(clock, (roomId) =>
      this.passOnMaster(roomId),
    );
    this.closure = new RoomClosure(clock, (roomId) =>
      this.closeAbandoned(roomId),
    );
  }

  /** A Room has just been opened: its abandonment period starts at once. */
  roomOpened(roomId: string): void {
    this.closure.watch(roomId);
  }

  /** Whether anyone is connected to the Room right now. */
  isLive(roomId: string): boolean {
    return this.presence.isLive(roomId);
  }

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
      if (socket.readyState !== WebSocket.OPEN) return undefined;

      this.leave(socket);
      const arrived = this.presence.enter(
        room.id,
        room.masterId,
        participant,
        socket,
        this.clock.now(),
      );
      this.closure.stop(room.id);
      // A Room whose Master ran out of grace while empty gives the role to
      // whoever arrives first, before their own snapshot is drawn.
      if (identity.id === this.presence.masterOf(room.id)) {
        this.failover.stop(room.id);
      } else if (this.failover.expired(room.id)) {
        await this.passOnMaster(room.id, identity.id);
      }
      if (arrived) {
        this.broadcast(room.id, identity.id, 'room.participantJoined', {
          participant: this.presence.participant(room.id, identity.id),
        });
      }
      return this.snapshot(socket, identity.id, room);
    });
  }

  /**
   * A Participant who has lost the thread — a revision they never saw — asks
   * for the Room as it stands. They are already in it: nobody else hears.
   */
  @SubscribeMessage('room.resync')
  resync(
    @ConnectedSocket() socket: WebSocket,
  ): Promise<WsResponse<RoomSnapshot | RejectedEvent> | undefined> {
    return this.rejecting('room.resync', async () => {
      const { identity, roomId } = await this.inRoom(socket);
      return this.snapshot(
        socket,
        identity.id,
        await this.rooms.openById(roomId),
      );
    });
  }

  /**
   * A client says it is still there, how far behind the Room it is and what
   * round trip it last measured; the reply echoes its own clock so it can
   * measure the next one. This is the only thing presence is read from.
   */
  @SubscribeMessage('room.heartbeat')
  heartbeat(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() command: Partial<HeartbeatCommand> | null,
  ): WsResponse<HeartbeatAck> {
    const place = this.presence.placeOf(socket);
    if (place) {
      this.presence.beat(socket, {
        at: this.clock.now(),
        latencyMs: reported(command?.latencyMs),
        revision: reported(command?.revision) ?? 0,
      });
      this.reportPresence(place.roomId);
    }
    return {
      event: 'room.heartbeatAck',
      data: { sentAt: Number(command?.sentAt ?? 0) },
    };
  }

  /**
   * The Room as it stands, for one Participant. The revision is read before
   * the Queue and the Playback, so a change landing mid-read is one the
   * snapshot may already hold but the client is sent anyway: every event can
   * be applied twice without harm, while a missed one cannot be recovered.
   */
  private async snapshot(
    socket: WebSocket,
    identityId: string,
    room: Room,
  ): Promise<WsResponse<RoomSnapshot>> {
    const revision = this.revisions.current(room.id);
    const [queue, playback] = await Promise.all([
      this.queue.entries(room.id),
      this.playback.current(room.id),
    ]);
    // A snapshot says as much as a heartbeat: they are at this revision now.
    this.presence.applied(socket, revision, this.clock.now());
    return {
      event: 'room.snapshot',
      data: {
        room: { code: room.code, name: room.name },
        you: identityId,
        participants: this.presence.participants(room.id),
        queue,
        playback,
        revision,
        presence: this.following(room.id),
      },
    };
  }

  /**
   * A Guest walks out. The Master cannot: they are refused with
   * `master-must-choose` until they have handed the role over or closed the
   * Room, so a Room is never left without anyone driving it.
   */
  @SubscribeMessage('room.leave')
  leaveRoom(
    @ConnectedSocket() socket: WebSocket,
  ): Promise<WsResponse<RejectedEvent> | undefined> {
    return this.rejecting('room.leave', async () => {
      const { identity, roomId } = await this.inRoom(socket);
      if (await this.rooms.isMaster(roomId, identity.id)) {
        throw new Rejected('master-must-choose');
      }
      this.leave(socket);
      return undefined;
    });
  }

  /**
   * The Master removes a Participant. They are out of the Room at once,
   * whatever they have open, and the Room Code stops working for them; their
   * Queue Entries are left exactly where they are.
   */
  @SubscribeMessage('room.kick')
  kick(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() command: Partial<KickCommand> | null,
  ): Promise<WsResponse<RejectedEvent> | undefined> {
    return this.rejecting('room.kick', async () => {
      const { identity, roomId } = await this.inRoom(socket);
      const kicked = await this.rooms.kick(
        identity,
        roomId,
        command?.identityId,
      );
      // Sent before they go, so their own tabs hear it too.
      this.publish(roomId, 'room.participantKicked', kicked);
      this.presence.evict(roomId, kicked.identityId);
      this.reportPresence(roomId);
      this.watchIfEmpty(roomId);
      return undefined;
    });
  }

  /**
   * The Master closes the Room. Everyone is told, nobody is left in it
   * and the Room Code stops working; the Hands it reviewed are untouched.
   */
  @SubscribeMessage('room.close')
  closeRoom(
    @ConnectedSocket() socket: WebSocket,
  ): Promise<WsResponse<RejectedEvent> | undefined> {
    return this.rejecting('room.close', async () => {
      const { identity, roomId } = await this.inRoom(socket);
      await this.rooms.close(identity, roomId);
      this.roomClosed(roomId);
      return undefined;
    });
  }

  /** The Master hands the role to another Participant; Playback carries on. */
  @SubscribeMessage('room.handOver')
  handOver(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() command: Partial<HandOverMasterCommand> | null,
  ): Promise<WsResponse<RejectedEvent> | undefined> {
    return this.rejecting('room.handOver', async () => {
      const { identity, roomId } = await this.inRoom(socket);
      const changed = await this.masters.handOver(
        identity,
        roomId,
        command?.identityId,
      );
      this.masterChanged(roomId, changed);
      return undefined;
    });
  }

  /** The Master loads a Hand from the Queue; every table goes to its Initial State. */
  @SubscribeMessage('playback.load')
  load(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() command: Partial<LoadHandCommand> | null,
  ): Promise<WsResponse<RejectedEvent> | undefined> {
    return this.changePlayback('playback.load', socket, (master, roomId) =>
      this.playback.load(master, roomId, command?.handId),
    );
  }

  /** The Master's "go to Action N", for stepping either way. */
  @SubscribeMessage('playback.goTo')
  goTo(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() command: Partial<GoToActionCommand> | null,
  ): Promise<WsResponse<RejectedEvent> | undefined> {
    return this.changePlayback('playback.goTo', socket, (master, roomId) =>
      this.playback.goTo(master, roomId, command?.actionIndex),
    );
  }

  /** The Master gives a Hand in the Queue another Author, for everyone. */
  @SubscribeMessage('queue.reassignAuthor')
  reassignAuthor(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() command: Partial<ReassignAuthorCommand> | null,
  ): Promise<WsResponse<RejectedEvent> | undefined> {
    return this.rejecting('queue.reassignAuthor', async () => {
      const { identity, roomId } = await this.inRoom(socket);
      this.publish(
        roomId,
        'queue.authorChanged',
        await this.queue.reassignAuthor(
          identity,
          roomId,
          command?.handId,
          command?.authorId,
        ),
      );
      return undefined;
    });
  }

  /** The Master reorders the Queue, the same order for everyone. */
  @SubscribeMessage('queue.reorder')
  reorder(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() command: Partial<ReorderQueueCommand> | null,
  ): Promise<WsResponse<RejectedEvent> | undefined> {
    return this.rejecting('queue.reorder', async () => {
      const { identity, roomId } = await this.inRoom(socket);
      const order = await this.queue.reorder(identity, roomId, command?.order);
      this.publish(roomId, 'queue.reordered', { order });
      return undefined;
    });
  }

  /** The Master removes a Queue Entry; the Hand stays, undoable for 10 s. */
  @SubscribeMessage('queue.remove')
  remove(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() command: Partial<RemoveQueueEntryCommand> | null,
  ): Promise<WsResponse<RejectedEvent> | undefined> {
    return this.rejecting('queue.remove', async () => {
      const { identity, roomId } = await this.inRoom(socket);
      this.publish(
        roomId,
        'queue.entryRemoved',
        await this.queue.remove(identity, roomId, command?.id),
      );
      return undefined;
    });
  }

  /** The Master undoes a removal within its 10 s window. */
  @SubscribeMessage('queue.undoRemoval')
  undoRemoval(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() command: Partial<UndoQueueRemovalCommand> | null,
  ): Promise<WsResponse<RejectedEvent> | undefined> {
    return this.rejecting('queue.undoRemoval', async () => {
      const { identity, roomId } = await this.inRoom(socket);
      const entry = await this.queue.undoRemoval(identity, roomId, command?.id);
      this.publish(roomId, 'queue.entryRestored', { entry });
      return undefined;
    });
  }

  /**
   * Applies a Playback change and sends the new Playback to the whole Room.
   * Changes to one Room apply, and are sent, in the order they arrived.
   */
  private changePlayback(
    command: string,
    socket: WebSocket,
    change: (master: Identity, roomId: string) => Promise<Playback>,
  ): Promise<WsResponse<RejectedEvent> | undefined> {
    return this.rejecting(command, async () => {
      const { identity, roomId } = await this.inRoom(socket);
      await this.inOrder(roomId, async () => {
        this.publish(
          roomId,
          'playback.changed',
          await change(identity, roomId),
        );
      });
      return undefined;
    });
  }

  private leave(socket: WebSocket): void {
    const place = this.presence.placeOf(socket);
    const wasMaster =
      place !== null &&
      place.identityId === this.presence.masterOf(place.roomId);
    const left = this.presence.exit(socket);
    if (left) {
      if (wasMaster) this.failover.watch(left.roomId);
      this.broadcast(left.roomId, left.identityId, 'room.participantLeft', {
        identityId: left.identityId,
      });
      this.watchIfEmpty(left.roomId);
    }
  }

  /** A Room nobody is connected to any more starts its abandonment period. */
  private watchIfEmpty(roomId: string): void {
    if (!this.presence.isLive(roomId)) this.closure.watch(roomId);
  }

  /** Closes a Room that has sat empty for the whole abandonment period. */
  private async closeAbandoned(roomId: string): Promise<void> {
    // Someone arrived while the closure was on its way to running.
    if (this.presence.isLive(roomId)) return;
    if (await this.rooms.closeAbandoned(roomId)) this.roomClosed(roomId);
  }

  /** Tells the Room it has closed and empties it; it never reopens. */
  private roomClosed(roomId: string): void {
    this.publish(roomId, 'room.closed', {});
    this.presence.clear(roomId);
    this.failover.stop(roomId);
    this.closure.stop(roomId);
    this.revisions.forget(roomId);
    this.presenceTold.delete(roomId);
  }

  /**
   * Gives the Master role to the Participant present the longest, once the
   * Master has been away too long. With nobody there to take it the watch is
   * left armed, and the next Participant to arrive takes it instead.
   */
  private async passOnMaster(
    roomId: string,
    exceptIdentityId?: string,
  ): Promise<void> {
    const masterId = this.presence.masterOf(roomId);
    if (masterId === null) return;
    if (this.presence.participant(roomId, masterId)) {
      this.failover.stop(roomId);
      return;
    }
    const successor = this.presence.participants(roomId)[0];
    if (!successor) return;
    const changed = await this.masters.failOver(
      roomId,
      masterId,
      successor.identityId,
    );
    if (!changed) {
      this.failover.stop(roomId);
      return;
    }
    this.masterChanged(roomId, changed, exceptIdentityId);
  }

  /**
   * Records the new Master and tells the Room. A new Master who isn't
   * connected starts a grace period of their own.
   */
  private masterChanged(
    roomId: string,
    changed: MasterChanged,
    /** The arriving Participant, whose own snapshot already says it. */
    exceptIdentityId?: string,
  ): void {
    this.presence.setMaster(roomId, changed.masterId);
    this.failover.stop(roomId);
    if (!this.presence.participant(roomId, changed.masterId)) {
      this.failover.watch(roomId);
    }
    this.broadcast(roomId, exceptIdentityId, 'room.masterChanged', changed);
  }

  private async authenticated(socket: WebSocket): Promise<Identity> {
    const identity = this.identityOf.get(socket);
    if (!identity) throw new Rejected('unauthenticated');
    return identity;
  }

  /** Runs `change` after every earlier Playback change of the Room has settled. */
  private inOrder(roomId: string, change: () => Promise<void>): Promise<void> {
    const previous = this.playbackChanges.get(roomId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(change);
    this.playbackChanges.set(roomId, next);
    void next
      .finally(() => {
        if (this.playbackChanges.get(roomId) === next) {
          this.playbackChanges.delete(roomId);
        }
      })
      .catch(() => {});
    return next;
  }

  private async inRoom(
    socket: WebSocket,
  ): Promise<{ identity: Identity; roomId: string }> {
    const identity = await this.authenticated(socket);
    const place = this.presence.placeOf(socket);
    if (!place) throw new Rejected('not-in-room');
    return { identity, roomId: place.roomId };
  }

  /** Sends a change to every connection in the Room, at the revision it makes. */
  publish(roomId: string, event: string, data: unknown): void {
    this.broadcast(roomId, undefined, event, data);
  }

  /**
   * Sends one change of the Room's shared state, taking the next revision for
   * it. A Participant left out still counts the revision as spent: their own
   * snapshot already holds the change, so no Participant is left with a hole
   * in the Revisions they have seen.
   */
  private broadcast(
    roomId: string,
    exceptIdentityId: string | undefined,
    event: string,
    data: unknown,
  ): void {
    const revision = this.revisions.next(roomId);
    this.send(roomId, exceptIdentityId, { event, data, revision });
    this.reportPresence(roomId);
  }

  /**
   * Tells the Room how everyone in it is following, when that has changed.
   * Presence carries no revision: each report replaces the last, and one
   * going astray costs nothing but a few seconds of a stale reading.
   */
  private reportPresence(roomId: string): void {
    const following = this.following(roomId);
    if (!presenceChanged(this.presenceTold.get(roomId), following)) return;
    this.presenceTold.set(roomId, following);
    this.send(roomId, undefined, {
      event: 'room.presence',
      data: { participants: following },
    });
  }

  /** How everyone in the Room is following it, as of now. */
  private following(roomId: string): ParticipantPresence[] {
    return this.presence.following(
      roomId,
      this.revisions.current(roomId),
      this.clock.now(),
    );
  }

  private send(
    roomId: string,
    exceptIdentityId: string | undefined,
    message: { event: string; data: unknown; revision?: number },
  ): void {
    const raw = JSON.stringify(message);
    for (const socket of this.presence.connections(roomId, exceptIdentityId)) {
      if (socket.readyState === WebSocket.OPEN) socket.send(raw);
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

/** A count a client reported, or null when it sent anything else. */
function reported(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
