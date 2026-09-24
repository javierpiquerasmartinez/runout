import { Controller, Get, Header, Headers, Param } from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import { IdentityService } from '../identity/identity.service.js';
import { MarksService } from '../rooms/marks.service.js';
import { NotesService, type Note } from '../rooms/notes.service.js';
import { HandsService, type HandWithTimeline } from './hands.service.js';

/** A Hand's Notes as they are read outside a Room, with this viewer's own Mark. */
interface HandNotesView {
  /** Read-only here: Notes are only ever written, rewritten or deleted inside a Room. */
  notes: Note[];
  /** Whether this viewer has Marked the Hand. Nobody else is ever told. */
  marked: boolean;
}

@Controller('hands')
export class HandsController {
  constructor(
    private readonly identities: IdentityService,
    private readonly hands: HandsService,
    private readonly notes: NotesService,
    private readonly marks: MarksService,
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

  /**
   * A Hand's Notes, and whether the viewer has Marked it, for the Hand seen
   * outside a Room: both outlive the Room they were made in. Read-only —
   * writing a Note, or Marking, happens over the WebSocket, in a Room.
   */
  @Get(':id/notes')
  @Header('Cache-Control', 'private, no-cache')
  async notesOf(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<HandNotesView> {
    const viewer = await this.identities.authenticate(
      bearerToken(authorization),
    );
    await this.hands.requireVisible(viewer, id);
    const [notes, marked] = await Promise.all([
      this.notes.ofHand(id),
      this.marks.isMarked(viewer.id, id),
    ]);
    return { notes, marked };
  }
}
