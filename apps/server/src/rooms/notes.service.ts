import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';
import {
  identities,
  marks,
  notes,
  queueEntries,
} from '../database/schema.js';
import { isUuid } from '../database/uuid.js';
import type { Identity } from '../identity/identity.service.js';
import { Rejected } from '../rejection/rejection.js';
import { RoomsService } from './rooms.service.js';

/** The longest a Note may be. Long enough for a conclusion, not for an essay. */
export const NOTE_MAX_LENGTH = 2_000;

/** How long a deleted Note can still be brought back. */
const UNDO_WINDOW_MS = 10_000;

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
 * Master of a Room the Hand is in rewrites or deletes it, and a deletion can
 * be undone for 10 s. Notes outlive the Room they were written in, and
 * outside one they are only ever read.
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

  /** Every Note on one Hand, oldest first. Read-only: the caller may see the Hand. */
  async ofHand(handId: string): Promise<Note[]> {
    const rows = await this.db
      .select(noteColumns)
      .from(notes)
      .innerJoin(identities, eq(identities.id, notes.writerId))
      .where(and(eq(notes.handId, handId), isNull(notes.removedAt)))
      .orderBy(asc(notes.seq));
    return rows.map(toNote);
  }

  /** Any Participant writes a Note on a Hand in their Room's Queue. */
  async write(
    writer: Identity,
    roomId: string,
    handId: unknown,
    body: unknown,
  ): Promise<Note> {
    await this.rooms.requireParticipant(roomId, writer.id);
    await this.requireQueued(roomId, handId);
    const [written] = await this.db
      .insert(notes)
      .values({
        handId: handId as string,
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
    const note = await this.editable(master, roomId, noteId);
    await this.db
      .update(notes)
      .set({ body: validBody(body), editedAt: this.clock.now() })
      .where(eq(notes.id, note.id));
    return this.byId(note.id);
  }

  /**
   * The Master deletes a Note, soft: it is gone for everyone at once, and
   * undoing within 10 s brings it back as it was (see `undoRemoval`).
   */
  async remove(
    master: Identity,
    roomId: string,
    noteId: unknown,
  ): Promise<{ id: string }> {
    const note = await this.editable(master, roomId, noteId);
    await this.db
      .update(notes)
      .set({ removedAt: this.clock.now() })
      .where(eq(notes.id, note.id));
    return { id: note.id };
  }

  /** The Master undoes a deletion within its 10 s window. */
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
    if (!row || row.removedAt === null) throw new Rejected('nothing-to-undo');
    await this.requireQueued(roomId, row.handId);
    if (this.clock.now().getTime() - row.removedAt.getTime() > UNDO_WINDOW_MS) {
      throw new Rejected('undo-expired');
    }
    await this.db
      .update(notes)
      .set({ removedAt: null })
      .where(eq(notes.id, noteId));
    return this.byId(noteId);
  }

  /** The Hands this person has Marked among those in a Room's Queue. */
  async marksInRoom(identityId: string, roomId: string): Promise<string[]> {
    const rows = await this.db
      .select({ handId: marks.handId })
      .from(marks)
      .innerJoin(
        queueEntries,
        and(
          eq(queueEntries.handId, marks.handId),
          eq(queueEntries.roomId, roomId),
          isNull(queueEntries.removedAt),
        ),
      )
      .where(eq(marks.identityId, identityId))
      .orderBy(asc(marks.markedAt));
    return rows.map((row) => row.handId);
  }

  /** Whether this person has Marked the Hand. Nobody else is ever told. */
  async isMarked(identityId: string, handId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ handId: marks.handId })
      .from(marks)
      .where(and(eq(marks.identityId, identityId), eq(marks.handId, handId)));
    return row !== undefined;
  }

  /**
   * A Participant Marks a Hand in their Room's Queue, or takes the Mark off.
   * The Mark is theirs alone: no other Participant ever hears of it.
   */
  async setMark(
    person: Identity,
    roomId: string,
    handId: unknown,
    marked: unknown,
  ): Promise<{ handId: string; marked: boolean }> {
    await this.rooms.requireParticipant(roomId, person.id);
    await this.requireQueued(roomId, handId);
    const id = handId as string;
    if (marked === false) {
      await this.db
        .delete(marks)
        .where(and(eq(marks.identityId, person.id), eq(marks.handId, id)));
      return { handId: id, marked: false };
    }
    await this.db
      .insert(marks)
      .values({ identityId: person.id, handId: id, markedAt: this.clock.now() })
      .onConflictDoNothing();
    return { handId: id, marked: true };
  }

  /**
   * The Note a Master may rewrite or delete: one on a Hand that is in the
   * Queue of the Room they hold, and that is still there.
   */
  private async editable(
    master: Identity,
    roomId: string,
    noteId: unknown,
  ): Promise<{ id: string }> {
    await this.rooms.requireMaster(roomId, master.id);
    if (!isUuid(noteId)) throw new Rejected('note-not-found');
    const [row] = await this.db
      .select({ id: notes.id, handId: notes.handId })
      .from(notes)
      .where(and(eq(notes.id, noteId), isNull(notes.removedAt)));
    if (!row) throw new Rejected('note-not-found');
    await this.requireQueued(roomId, row.handId);
    return { id: row.id };
  }

  /** Refuses with `hand-not-in-queue` unless the Hand is in the Room's Queue. */
  private async requireQueued(roomId: string, handId: unknown): Promise<void> {
    if (!isUuid(handId)) throw new Rejected('hand-not-in-queue');
    const [queued] = await this.db
      .select({ id: queueEntries.id })
      .from(queueEntries)
      .where(
        and(
          eq(queueEntries.roomId, roomId),
          eq(queueEntries.handId, handId),
          isNull(queueEntries.removedAt),
        ),
      )
      .limit(1);
    if (!queued) throw new Rejected('hand-not-in-queue');
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
