import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import { identities, notes, queueEntries } from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';
import { requireQueued } from './queued-hand.js';
import { RoomsService } from './rooms.service.js';
import { requireUndoable } from './undo-window.js';

/** The longest a Note may be. Long enough for a conclusion, not for an essay. */
const NOTE_MAX_LENGTH = 2_000;

/** A Note as everyone who can see the Hand reads it. */
export interface Note {
  id: string;
  /** Where it falls among the Notes written: two of the same instant still have an order. */
  seq: number;
  handId: string;
  writer: { identityId: string; displayName: string };
  body: string;
  /** When it was written, as an ISO instant. */
  writtenAt: string;
  /** When a Master last rewrote it; null while it stands as written. */
  editedAt: string | null;
}

/**
 * The conclusions written on Hands. Any Participant writes one; only the
 * Master of a Room the Hand is in rewrites or removes it, and a removal can
 * be undone for as long as the undo window lasts. Notes outlive the Room they
 * were written in, and outside one they are only ever read.
 */
@Injectable()
export class NotesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly rooms: RoomsService,
  ) {}

  /** Every Note on the Hands in a Room's Queue, oldest first. */
  async inRoom(roomId: string): Promise<Note[]> {
    const rows = await this.db
      .select(noteColumns)
      .from(notes)
      .innerJoin(identities, eq(identities.id, notes.writerId))
      .innerJoin(
        queueEntries,
        and(
          eq(queueEntries.handId, notes.handId),
          eq(queueEntries.roomId, roomId),
          isNull(queueEntries.removedAt),
        ),
      )
      .where(isNull(notes.removedAt))
      .orderBy(asc(notes.seq));
    return rows.map(toNote);
  }

  /**
   * Every Note on these Hands, oldest first. What a Hand brings with it as it
   * joins a Queue: a Hand reviewed in an earlier Room arrives already written on.
   */
  async ofHands(handIds: string[]): Promise<Note[]> {
    if (handIds.length === 0) return [];
    const rows = await this.db
      .select(noteColumns)
      .from(notes)
      .innerJoin(identities, eq(identities.id, notes.writerId))
      .where(and(inArray(notes.handId, handIds), isNull(notes.removedAt)))
      .orderBy(asc(notes.seq));
    return rows.map(toNote);
  }

  /** Every Note on one Hand, oldest first. Read-only: the caller may see the Hand. */
  ofHand(handId: string): Promise<Note[]> {
    return this.ofHands([handId]);
  }

  /** Any Participant writes a Note on a Hand in their Room's Queue. */
  async write(
    writer: Identity,
    roomId: string,
    handId: unknown,
    body: unknown,
  ): Promise<Note> {
    await this.rooms.requireParticipant(roomId, writer.id);
    const queued = await requireQueued(this.db, roomId, handId);
    const [written] = await this.db
      .insert(notes)
      .values({
        handId: queued,
        writerId: writer.id,
        body: validBody(body),
        writtenAt: this.clock.now(),
      })
      .returning({ id: notes.id });
    return this.byId(written.id);
  }

  /** The Master rewrites any Note on a Hand in their Room's Queue. */
  async edit(
    master: Identity,
    roomId: string,
    noteId: unknown,
    body: unknown,
  ): Promise<Note> {
    const id = await this.editable(master, roomId, noteId);
    await this.db
      .update(notes)
      .set({ body: validBody(body), editedAt: this.clock.now() })
      .where(eq(notes.id, id));
    return this.byId(id);
  }

  /**
   * The Master removes a Note, soft: it is gone for everyone at once, and
   * undoing within the window brings it back as it was (see `undoRemoval`).
   */
  async remove(
    master: Identity,
    roomId: string,
    noteId: unknown,
  ): Promise<{ id: string }> {
    const id = await this.editable(master, roomId, noteId);
    await this.db
      .update(notes)
      .set({ removedAt: this.clock.now() })
      .where(eq(notes.id, id));
    return { id };
  }

  /** The Master undoes a removal within its window. */
  async undoRemoval(
    master: Identity,
    roomId: string,
    noteId: unknown,
  ): Promise<Note> {
    await this.rooms.requireMaster(roomId, master.id);
    if (!isUuid(noteId)) throw new Rejected('nothing-to-undo');
    const [row] = await this.db
      .select({ handId: notes.handId, removedAt: notes.removedAt })
      .from(notes)
      .where(eq(notes.id, noteId));
    if (!row) throw new Rejected('nothing-to-undo');
    await requireQueued(this.db, roomId, row.handId);
    requireUndoable(this.clock, row.removedAt);
    await this.db
      .update(notes)
      .set({ removedAt: null })
      .where(eq(notes.id, noteId));
    return this.byId(noteId);
  }

  /**
   * The id of a Note a Master may rewrite or remove: one on a Hand that is in
   * the Queue of the Room they hold, and that is still there.
   */
  private async editable(
    master: Identity,
    roomId: string,
    noteId: unknown,
  ): Promise<string> {
    await this.rooms.requireMaster(roomId, master.id);
    if (!isUuid(noteId)) throw new Rejected('note-not-found');
    const [row] = await this.db
      .select({ id: notes.id, handId: notes.handId })
      .from(notes)
      .where(and(eq(notes.id, noteId), isNull(notes.removedAt)));
    if (!row) throw new Rejected('note-not-found');
    await requireQueued(this.db, roomId, row.handId);
    return row.id;
  }

  private async byId(id: string): Promise<Note> {
    const [row] = await this.db
      .select(noteColumns)
      .from(notes)
      .innerJoin(identities, eq(identities.id, notes.writerId))
      .where(eq(notes.id, id));
    return toNote(row);
  }
}

const noteColumns = {
  id: notes.id,
  seq: notes.seq,
  handId: notes.handId,
  body: notes.body,
  writtenAt: notes.writtenAt,
  editedAt: notes.editedAt,
  writerId: notes.writerId,
  writerName: identities.displayName,
};

interface NoteRow {
  id: string;
  seq: number;
  handId: string;
  body: string;
  writtenAt: Date;
  editedAt: Date | null;
  writerId: string;
  writerName: string | null;
}

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    seq: row.seq,
    handId: row.handId,
    writer: { identityId: row.writerId, displayName: row.writerName ?? '' },
    body: row.body,
    writtenAt: row.writtenAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

function validBody(raw: unknown): string {
  const body = typeof raw === 'string' ? raw.trim() : '';
  if (body.length === 0 || body.length > NOTE_MAX_LENGTH) {
    throw new Rejected('invalid-note');
  }
  return body;
}
