import {
  Body,
  Controller,
  Delete,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import {
  IdentityService,
  type Identity,
} from '../identity/identity.service.js';
import { NotesService, type Note } from '../rooms/notes.service.js';
import { RoomGateway } from '../rooms/room.gateway.js';

/**
 * Notes written, rewritten and removed from the Library, by whoever has the
 * Hand in theirs. An open Room reviewing the Hand hears of each change as if
 * it had been made there.
 */
@Controller('library')
export class LibraryNotesController {
  constructor(
    private readonly identities: IdentityService,
    private readonly notes: NotesService,
    private readonly rooms: RoomGateway,
  ) {}

  /** Writes a Note on a Hand of the Account's Library. */
  @Post('hands/:id/notes')
  async write(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') handId: string,
    @Body() body: { body?: unknown } = {},
  ): Promise<Note> {
    const account = await this.authenticate(authorization);
    const note = await this.notes.writeFromLibrary(account, handId, body.body);
    await this.rooms.handNotesChanged(note.handId, {
      event: 'notes.written',
      data: { note },
    });
    return note;
  }

  /** Rewrites any Note on a Hand of the Account's Library. */
  @Patch('notes/:id')
  async edit(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: { body?: unknown } = {},
  ): Promise<Note> {
    const account = await this.authenticate(authorization);
    const note = await this.notes.editFromLibrary(account, id, body.body);
    await this.rooms.handNotesChanged(note.handId, {
      event: 'notes.edited',
      data: { note },
    });
    return note;
  }

  /** Removes any Note on a Hand of the Account's Library; it can be brought back for 10 s. */
  @Delete('notes/:id')
  async remove(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<{ id: string }> {
    const account = await this.authenticate(authorization);
    const removed = await this.notes.removeFromLibrary(account, id);
    await this.rooms.handNotesChanged(removed.handId, {
      event: 'notes.removed',
      data: { id: removed.id },
    });
    return { id: removed.id };
  }

  /** Brings a removed Note back, within its 10 s. */
  @Post('notes/:id/restore')
  async undoRemoval(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<Note> {
    const account = await this.authenticate(authorization);
    const note = await this.notes.undoRemovalFromLibrary(account, id);
    await this.rooms.handNotesChanged(note.handId, {
      event: 'notes.restored',
      data: { note },
    });
    return note;
  }

  private authenticate(authorization: string | undefined): Promise<Identity> {
    return this.identities.authenticateAccount(bearerToken(authorization));
  }
}
