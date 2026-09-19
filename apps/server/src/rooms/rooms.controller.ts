import {
  Body,
  Controller,
  Get,
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
import type { Discarded } from '../hands/import/import.js';
import { FileTooLargeFilter } from '../rejection/file-too-large.filter.js';
import { ImportsService, type ImportPreview } from './imports.service.js';
import { QueueService } from './queue.service.js';
import { RoomGateway } from './room.gateway.js';
import { RoomsService, type RoomSummary } from './rooms.service.js';

/** The largest file one upload may carry. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** The parts of an uploaded file, as multer hands it over, that the import reads. */
interface UploadedPart {
  originalname: string;
  buffer: Buffer;
}

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly identities: IdentityService,
    private readonly rooms: RoomsService,
    private readonly queue: QueueService,
    private readonly imports: ImportsService,
    private readonly gateway: RoomGateway,
  ) {}

  @Post()
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { name?: unknown; displayName?: unknown } = {},
  ): Promise<RoomSummary> {
    const creator = await this.identities.authenticate(
      bearerToken(authorization),
    );
    return this.rooms.create(creator, {
      name: body.name,
      displayName: body.displayName,
    });
  }

  /** Lets the web check a typed code, and name the Room, before joining. */
  @Get(':code')
  async find(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
  ): Promise<RoomSummary> {
    await this.identities.authenticate(bearerToken(authorization));
    const room = await this.rooms.findOpen(code);
    return { code: room.code, name: room.name };
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
    if (entries.length > 0) {
      this.gateway.publish(room.id, 'queue.entriesAdded', { entries });
    }
    return { imported: entries.length, discarded };
  }

  /**
   * The first step of an import: reads one uploaded .txt or .zip file (the
   * `file` part), or pasted `text`, into a preview. `format` picks the
   * format by hand instead of detecting it.
   */
  @Post(':code/imports/previews')
  @UseFilters(FileTooLargeFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async preview(
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
      code,
      file
        ? { name: file.originalname, bytes: file.buffer }
        : { text: body.text },
      body.format,
    );
  }

  /**
   * The second step: appends the Hands of the kept previews to the Queue and
   * broadcasts them to every Participant, the Importer included.
   */
  @Post(':code/imports')
  async confirm(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
    @Body() body: { previews?: unknown } = {},
  ): Promise<{ imported: number }> {
    const importer = await this.identities.authenticate(
      bearerToken(authorization),
    );
    const { room, entries } = await this.imports.confirm(
      importer,
      code,
      body.previews,
    );
    if (entries.length > 0) {
      this.gateway.publish(room.id, 'queue.entriesAdded', { entries });
    }
    return { imported: entries.length };
  }
}
