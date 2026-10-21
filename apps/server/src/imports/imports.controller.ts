import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { bearerToken } from '../identity/bearer-token.js';
import { IdentityService } from '../identity/identity.service.js';
import { FileTooLargeFilter } from '../rejection/file-too-large.filter.js';
import { RoomGateway } from '../rooms/room.gateway.js';
import {
  ImportsService,
  type ImportPreview,
  type ImportSource,
} from './imports.service.js';

/** The largest file one upload may carry, into either destination. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** The parts of an uploaded file, as multer hands it over, that the import reads. */
interface UploadedPart {
  originalname: string;
  buffer: Buffer;
}

const uploadOne = FileInterceptor('file', {
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

function sourceOf(file: UploadedPart | undefined, text: unknown): ImportSource {
  return file ? { name: file.originalname, bytes: file.buffer } : { text };
}

/**
 * Importing Hand Histories in two steps, into a Room's Queue or into the
 * Importer's Library: the first reads one uploaded .txt or .zip file (the
 * `file` part), or pasted `text`, into a preview, with `format` picking the
 * format by hand instead of detecting it; the second confirms the kept
 * previews.
 */
@Controller()
export class ImportsController {
  constructor(
    private readonly identities: IdentityService,
    private readonly imports: ImportsService,
    private readonly gateway: RoomGateway,
  ) {}

  @Post('rooms/:code/imports/previews')
  @UseFilters(FileTooLargeFilter)
  @UseInterceptors(uploadOne)
  async previewForRoom(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
    @UploadedFile() file: UploadedPart | undefined,
    @Body() body: { text?: unknown; format?: unknown } = {},
  ): Promise<ImportPreview> {
    const importer = await this.identities.authenticate(
      bearerToken(authorization),
    );
    return this.imports.preview(
      importer,
      { kind: 'room', code },
      sourceOf(file, body.text),
      body.format,
    );
  }

  /** Broadcasts the new Queue Entries to every Participant, the Importer included. */
  @Post('rooms/:code/imports')
  async confirmForRoom(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
    @Body() body: { previews?: unknown } = {},
  ): Promise<{ imported: number }> {
    const importer = await this.identities.authenticate(
      bearerToken(authorization),
    );
    const confirmed = await this.imports.confirm(
      importer,
      { kind: 'room', code },
      body.previews,
    );
    if (confirmed.kind !== 'room') return { imported: 0 };
    const { room, entries } = confirmed;
    if (entries.length > 0) await this.gateway.entriesAdded(room.id, entries);
    return { imported: entries.length };
  }

  /** Only an Account has a Library: `account-required` otherwise. */
  @Post('library/imports/previews')
  @UseFilters(FileTooLargeFilter)
  @UseInterceptors(uploadOne)
  async previewForLibrary(
    @Headers('authorization') authorization: string | undefined,
    @UploadedFile() file: UploadedPart | undefined,
    @Body() body: { text?: unknown; format?: unknown } = {},
  ): Promise<ImportPreview> {
    const importer = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    return this.imports.preview(
      importer,
      { kind: 'library' },
      sourceOf(file, body.text),
      body.format,
    );
  }

  @Post('library/imports')
  async confirmForLibrary(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { previews?: unknown } = {},
  ): Promise<{ imported: number }> {
    const importer = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    const confirmed = await this.imports.confirm(
      importer,
      { kind: 'library' },
      body.previews,
    );
    return { imported: confirmed.kind === 'library' ? confirmed.added : 0 };
  }
}
