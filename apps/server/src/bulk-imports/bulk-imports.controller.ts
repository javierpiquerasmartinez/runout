import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import type { UploadedPart } from '../file-store/file-store.js';
import { bearerToken } from '../identity/bearer-token.js';
import { IdentityService } from '../identity/identity.service.js';
import {
  BulkImportsService,
  type BulkImportView,
} from './bulk-imports.service.js';

/** An Account's Bulk Imports into its Library. */
@Controller('library/bulk-imports')
export class BulkImportsController {
  constructor(
    private readonly identities: IdentityService,
    private readonly bulkImports: BulkImportsService,
  ) {}

  /** Starts one, from its files' names and sizes; its files are then uploaded in parts. */
  @Post()
  async start(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { files?: unknown } = {},
  ): Promise<BulkImportView> {
    const account = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    return this.bulkImports.start(account, body.files);
  }

  /** The parts of one file already uploaded, to continue an interrupted upload. */
  @Get(':id/files/:file/parts')
  @Header('Cache-Control', 'private, no-cache')
  async uploadedParts(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Param('file') file: string,
  ): Promise<{ parts: UploadedPart[] }> {
    const account = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    return {
      parts: await this.bulkImports.uploadedParts(account, id, file),
    };
  }

  /** Where to upload these parts of one file, by its place in the import. */
  @Post(':id/files/:file/parts')
  async partUrls(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Param('file') file: string,
    @Body() body: { parts?: unknown } = {},
  ): Promise<{ parts: { partNumber: number; url: string }[] }> {
    const account = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    return {
      parts: await this.bulkImports.partUrls(account, id, file, body.parts),
    };
  }

  /** Every file is uploaded: the import service takes it from here. */
  @Post(':id/complete')
  async complete(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: { files?: unknown } = {},
  ): Promise<BulkImportView> {
    const account = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    return this.bulkImports.complete(account, id, body.files);
  }

  /** Stops one before its next batch; the Hands already imported stay. */
  @Post(':id/cancel')
  async cancel(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<BulkImportView> {
    const account = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    return this.bulkImports.cancel(account, id);
  }

  /** The Account's Bulk Imports, newest first. */
  @Get()
  @Header('Cache-Control', 'private, no-cache')
  async list(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<BulkImportView[]> {
    const account = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    return this.bulkImports.list(account);
  }
}
