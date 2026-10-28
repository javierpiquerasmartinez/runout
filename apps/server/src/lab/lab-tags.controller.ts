import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import { IdentityService } from '../identity/identity.service.js';
import { LabTagsService, type LabTag } from './lab-tags.service.js';

/**
 * An Account's Lab Tags, which group the Ranges of its Lab. They mirror the
 * Library's Tags but are a set of their own.
 */
@Controller('lab/tags')
export class LabTagsController {
  constructor(
    private readonly identities: IdentityService,
    private readonly tags: LabTagsService,
  ) {}

  /** The Account's Lab Tags, each with how many Ranges carry it. */
  @Get()
  @Header('Cache-Control', 'private, no-cache')
  async list(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<LabTag[]> {
    const account = await this.authenticate(authorization);
    return this.tags.list(account);
  }

  /** Creates a Lab Tag; its name is unique within the Account, ignoring case. */
  @Post()
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { name?: unknown } = {},
  ): Promise<LabTag> {
    const account = await this.authenticate(authorization);
    return this.tags.create(account, body.name);
  }

  /** Renames one of the Account's Lab Tags. */
  @Patch(':id')
  async rename(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: { name?: unknown } = {},
  ): Promise<LabTag> {
    const account = await this.authenticate(authorization);
    return this.tags.rename(account, id, body.name);
  }

  /** Deletes one of the Account's Lab Tags, and takes it off every Range. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<void> {
    const account = await this.authenticate(authorization);
    await this.tags.delete(account, id);
  }

  private authenticate(authorization: string | undefined) {
    return this.identities.authenticateAccount(bearerToken(authorization));
  }
}
