import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import { IdentityService } from '../identity/identity.service.js';
import { TagsService, type Tag, type TagChange } from './tags.service.js';

/**
 * An Account's Tags, kept from the Library. The list of Hands offers them,
 * with their counts, among its filter options.
 */
@Controller('library/tags')
export class TagsController {
  constructor(
    private readonly identities: IdentityService,
    private readonly tags: TagsService,
  ) {}

  /** Creates a Tag; its name is unique within the Account, ignoring case. */
  @Post()
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { name?: unknown } = {},
  ): Promise<Tag> {
    const account = await this.authenticate(authorization);
    return this.tags.create(account, body.name);
  }

  /** Renames one of the Account's Tags. */
  @Patch(':id')
  async rename(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: { name?: unknown } = {},
  ): Promise<Tag> {
    const account = await this.authenticate(authorization);
    return this.tags.rename(account, id, body.name);
  }

  /** Deletes one of the Account's Tags, and takes it off every Hand. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<void> {
    const account = await this.authenticate(authorization);
    await this.tags.delete(account, id);
  }

  /** Puts the Tag on the `handIds`, all of them in the Account's Library. */
  @Put(':id/hands')
  async attach(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: { handIds?: unknown } = {},
  ): Promise<TagChange> {
    const account = await this.authenticate(authorization);
    return this.tags.set(account, id, body.handIds, true);
  }

  /** Takes the Tag off the `handIds`. */
  @Delete(':id/hands')
  async detach(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: { handIds?: unknown } = {},
  ): Promise<TagChange> {
    const account = await this.authenticate(authorization);
    return this.tags.set(account, id, body.handIds, false);
  }

  private authenticate(authorization: string | undefined) {
    return this.identities.authenticateAccount(bearerToken(authorization));
  }
}
