/*
 * How Hand History text is cut into pieces, each one Hand or a run of text
 * that is none. Most layouts write each Hand as a run of non-blank lines, so
 * each such run is a piece. A layout may instead write a session: a header
 * shared by several Hands, then the Hands, blank lines or none between them
 * and inside them. A session is cut into one piece per Hand, each its own
 * text, the session's header and that Hand, which reads back as that Hand
 * alone. Text is cut as it comes, the same however it is split into
 * chunks, so a whole text and a stream of it give the same pieces.
 */

/** A layout that writes several Hands under one header. */
export interface SessionLayout {
  /**
   * Whether a piece that starts so opens a session. It is tried on the
   * piece's first characters, as they come, so it must match a prefix.
   */
  opens: RegExp;
  /** Where each Hand in the session starts. */
  handOpen: RegExp;
  /** What ends each Hand in the session. */
  handClose: string;
  /** What ends the session. */
  close: string;
  /** A Hand's own text, from the session's header and the Hand's text. */
  handText(header: string, hand: string): string;
}

/** One piece: its text, and where it came from in the text cut. */
export type Piece = { start: number; end: number } & (
  | { text: string }
  /** Longer than any Hand could be: dropped without being held. */
  | { tooLong: true }
);

/** How far into a piece a session may still be found to open. */
const OPENING_WINDOW = 1024;

type SessionPhase =
  /** Reading the header, up to the first Hand. */
  | 'header'
  /** Reading a Hand. */
  | 'hand'
  /** After a Hand, until the next one or the session's end. */
  | 'between'
  /** Dropping a Hand too long to be one, until its end. */
  | 'dropping-hand'
  /** Dropping a header too long to be one, until the session's end. */
  | 'dropping-session';

interface Session {
  layout: SessionLayout;
  phase: SessionPhase;
  /** Text not cut yet, and where it starts. */
  buffer: string;
  bufferStart: number;
  /** Where in `buffer` to look again for what ends the phase. */
  scanFrom: number;
  header: string;
  /** Where the session started. */
  start: number;
}

export class PieceCutter {
  private readonly out: Piece[] = [];
  /** Where the next character pushed sits in the whole text. */
  private position = 0;

  // A piece of lines, as it is read.
  private lines: string[] = [];
  private partial = '';
  private lineStart = 0;
  private pieceStart = -1;
  private pieceEnd = -1;
  private size = 0;
  private tooLong = false;
  /** Dropping a line already too long, until its end. */
  private droppingLine = false;

  private session: Session | null = null;

  constructor(
    private readonly layouts: readonly SessionLayout[],
    private readonly maxPieceChars = Infinity,
  ) {}

  /** The pieces the text completes, read on from where the last push left. */
  push(text: string): Piece[] {
    this.feed(text, this.position);
    this.position += text.length;
    return this.out.splice(0);
  }

  /** The pieces left once a text has ended; the next push starts a new one. */
  end(): Piece[] {
    if (this.session) this.endSession();
    if (!this.droppingLine) this.endLine(this.partial);
    this.partial = '';
    this.droppingLine = false;
    this.endPiece();
    this.lineStart = this.position;
    return this.out.splice(0);
  }

  private feed(text: string, base: number): void {
    let from = 0;
    // Reads on in the session open, if any; false once the text is read.
    const inSession = (at: number): boolean => {
      const rest = this.feedSession(text.slice(at));
      if (!rest) return false;
      ({ text, base } = rest);
      this.lineStart = base;
      from = 0;
      return true;
    };
    if (this.session && !inSession(0)) return;
    while (from < text.length) {
      const newline = text.indexOf('\n', from);
      const stop = newline === -1 ? text.length : newline;
      if (!this.droppingLine) {
        this.partial += text.slice(from, stop);
        if (this.openSession()) {
          if (!inSession(stop)) return;
          continue;
        }
      }
      if (newline === -1) {
        if (!this.droppingLine && this.partial.length > this.maxPieceChars) {
          // A line this long belongs to no Hand: drop it, and its piece.
          if (this.pieceStart < 0) this.pieceStart = this.lineStart;
          this.partial = '';
          this.droppingLine = true;
          this.tooLong = true;
          this.lines = [];
        }
        return;
      }
      if (!this.droppingLine) this.endLine(this.partial);
      this.partial = '';
      this.droppingLine = false;
      this.lineStart = base + newline + 1;
      from = newline + 1;
    }
  }

  private endLine(line: string): void {
    if (/^[ \t\r]*$/.test(line)) {
      this.endPiece();
      return;
    }
    if (this.pieceStart < 0)
      this.pieceStart = this.lineStart + line.search(/\S/);
    this.pieceEnd = this.lineStart + line.trimEnd().length;
    if (this.tooLong) return;
    this.size += line.length + 1;
    if (this.size > this.maxPieceChars) {
      this.tooLong = true;
      this.lines = [];
    } else {
      this.lines.push(line);
    }
  }

  private endPiece(): void {
    const start = this.pieceStart;
    const end = this.pieceEnd;
    if (this.tooLong) this.out.push({ start, end, tooLong: true });
    else if (this.lines.length > 0) {
      this.out.push({ start, end, text: this.lines.join('\n').trim() });
    }
    this.lines = [];
    this.size = 0;
    this.tooLong = false;
    this.pieceStart = -1;
    this.pieceEnd = -1;
  }

  /** Whether the piece read so far opens a session; if so, reads it as one. */
  private openSession(): boolean {
    if (this.layouts.length === 0 || this.tooLong) return false;
    // Only the piece's start says whether it opens one.
    if (this.size > OPENING_WINDOW) return false;
    const piece = (partial: string) =>
      this.lines.length > 0 ? `${this.lines.join('\n')}\n${partial}` : partial;
    const start = piece(this.partial.slice(0, 2 * OPENING_WINDOW)).trimStart();
    if (start === '') return false;
    const layout = this.layouts.find((candidate) =>
      candidate.opens.test(start.slice(0, OPENING_WINDOW)),
    );
    if (!layout) return false;
    const soFar = piece(this.partial);
    const leading = soFar.length - soFar.trimStart().length;
    const opensAt =
      this.lines.length > 0 ? this.pieceStart : this.lineStart + leading;
    this.session = {
      layout,
      phase: 'header',
      buffer: soFar.slice(leading),
      bufferStart: opensAt,
      scanFrom: 0,
      header: '',
      start: opensAt,
    };
    this.lines = [];
    this.partial = '';
    this.size = 0;
    this.pieceStart = -1;
    this.pieceEnd = -1;
    return true;
  }

  /**
   * Reads on in a session. Returns the text after its end, to be read as
   * pieces of lines again, or null when the session goes on.
   */
  private feedSession(text: string): { text: string; base: number } | null {
    const session = this.session!;
    const { layout } = session;
    session.buffer += text;
    for (;;) {
      const { buffer } = session;
      if (session.phase === 'hand' || session.phase === 'dropping-hand') {
        const close = buffer.indexOf(layout.handClose, session.scanFrom);
        if (close === -1) {
          this.waitFor(session, layout.handClose.length);
          if (session.phase === 'hand' && buffer.length > this.maxPieceChars) {
            this.out.push({
              start: session.bufferStart,
              end: session.bufferStart + buffer.length,
              tooLong: true,
            });
            session.phase = 'dropping-hand';
          }
          if (session.phase === 'dropping-hand') this.dropScanned(session);
          return null;
        }
        const end = close + layout.handClose.length;
        if (session.phase === 'hand') {
          this.out.push({
            start: session.bufferStart,
            end: session.bufferStart + end,
            text: layout.handText(session.header, buffer.slice(0, end)),
          });
        }
        this.consume(session, end);
        session.phase = 'between';
        continue;
      }

      const handOpen =
        session.phase === 'dropping-session'
          ? -1
          : search(layout.handOpen, buffer, session.scanFrom);
      // Only looked for up to the next Hand: the rest of a long session
      // isn't searched again for each of its Hands.
      const sessionClose =
        handOpen === -1
          ? buffer.indexOf(layout.close, session.scanFrom)
          : offset(
              buffer.slice(session.scanFrom, handOpen).indexOf(layout.close),
              session.scanFrom,
            );
      if (handOpen !== -1 && sessionClose === -1) {
        if (session.phase === 'header') {
          session.header = buffer.slice(0, handOpen);
        }
        this.consume(session, handOpen);
        session.phase = 'hand';
        continue;
      }
      if (sessionClose !== -1) {
        const end = sessionClose + layout.close.length;
        if (session.phase === 'header') {
          // A session without a Hand is a piece of its own.
          this.out.push({
            start: session.start,
            end: session.bufferStart + end,
            text: buffer.slice(0, end),
          });
        }
        this.session = null;
        return { text: buffer.slice(end), base: session.bufferStart + end };
      }
      this.waitFor(session, Math.max(layout.close.length, 64));
      if (session.phase === 'header' && buffer.length > this.maxPieceChars) {
        this.out.push({
          start: session.start,
          end: session.bufferStart + buffer.length,
          tooLong: true,
        });
        session.phase = 'dropping-session';
      }
      if (session.phase !== 'header') this.dropScanned(session);
      return null;
    }
  }

  /** What is left of a session when its text ends before the session does. */
  private endSession(): void {
    const session = this.session!;
    const { buffer } = session;
    const end = session.bufferStart + buffer.trimEnd().length;
    if (session.phase === 'header' && buffer.trim() !== '') {
      this.out.push({ start: session.start, end, text: buffer.trimEnd() });
    } else if (session.phase === 'hand') {
      this.out.push({
        start: session.bufferStart,
        end,
        text: session.layout.handText(session.header, buffer.trimEnd()),
      });
    }
    this.session = null;
  }

  /** Drops the first `length` characters of the session's buffer. */
  private consume(session: Session, length: number): void {
    session.buffer = session.buffer.slice(length);
    session.bufferStart += length;
    session.scanFrom = 0;
  }

  /** Looks again, next time, only where a marker cut by a chunk could be. */
  private waitFor(session: Session, markerLength: number): void {
    session.scanFrom = Math.max(0, session.buffer.length - markerLength);
  }

  /** Drops what has been looked through already: nothing in it is kept. */
  private dropScanned(session: Session): void {
    this.consume(session, session.scanFrom);
  }
}

/** A position found in a part of a text, in the whole text; -1 stays -1. */
function offset(found: number, partStart: number): number {
  return found === -1 ? -1 : found + partStart;
}

/** Where `pattern` first matches in `text` from `from`; -1 for nowhere. */
function search(pattern: RegExp, text: string, from: number): number {
  const global = new RegExp(
    pattern.source,
    `${pattern.flags.replace('g', '')}g`,
  );
  global.lastIndex = from;
  return global.exec(text)?.index ?? -1;
}
