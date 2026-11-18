import {
  Body,
  Controller,
  Delete,
  Get,
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
import {
  SavedFiltersService,
  type SavedFilter,
} from './saved-filters.service.js';

/**
 * An Account's Saved Filters, kept from the Library. Each holds the Más
 * filtros criteria (see `SavedCriteria`), to apply again over any period,
 * Poker Site, Hero or Stake.
 */
@Controller('library/saved-filters')
export class SavedFiltersController {
  constructor(
    private readonly identities: IdentityService,
    private readonly savedFilters: SavedFiltersService,
  ) {}

  /** The Account's Saved Filters, sorted by name. */
  @Get()
  async list(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<SavedFilter[]> {
    const account = await this.authenticate(authorization);
    return this.savedFilters.list(account);
  }

  /** Saves `criteria` under `name`, unique within the Account ignoring case. */
  @Post()
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { name?: unknown; criteria?: unknown } = {},
  ): Promise<SavedFilter> {
    const account = await this.authenticate(authorization);
    return this.savedFilters.create(account, body.name, body.criteria);
  }

  /** Renames one of the Account's Saved Filters. */
  @Patch(':id')
  async rename(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: { name?: unknown } = {},
  ): Promise<SavedFilter> {
    const account = await this.authenticate(authorization);
    return this.savedFilters.rename(account, id, body.name);
  }

  /** Replaces the criteria of one of the Account's Saved Filters. */
  @Put(':id/criteria')
  async replace(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: { criteria?: unknown } = {},
  ): Promise<SavedFilter> {
    const account = await this.authenticate(authorization);
    return this.savedFilters.replace(account, id, body.criteria);
  }

  /** Deletes one of the Account's Saved Filters. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<void> {
    const account = await this.authenticate(authorization);
    await this.savedFilters.delete(account, id);
  }

  private authenticate(authorization: string | undefined) {
    return this.identities.authenticateAccount(bearerToken(authorization));
  }
}
