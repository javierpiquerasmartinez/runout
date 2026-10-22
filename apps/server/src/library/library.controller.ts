import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import { IdentityService } from '../identity/identity.service.js';
import { RoomGateway } from '../rooms/room.gateway.js';
import { parseLibraryFilter } from './library-filter.js';
import {
  LibraryService,
  type LibraryPage,
  type MarkChange,
  type Removal,
} from './library.service.js';
import { ResultsService, type Results } from './results.service.js';

@Controller('library')
export class LibraryController {
  constructor(
    private readonly identities: IdentityService,
    private readonly library: LibraryService,
    private readonly results: ResultsService,
    private readonly gateway: RoomGateway,
  ) {}

  /**
   * One page of the Account's Library, newest first, narrowed by the Library
   * filter in the query (see `LibraryFilter`), with its total. An anonymous
   * identity has no Library: `account-required`.
   */
  @Get('hands')
  @Header('Cache-Control', 'private, no-cache')
  async hands(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: Record<string, unknown>,
  ): Promise<LibraryPage> {
    const account = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    return this.library.page(
      account,
      parseLibraryFilter(query),
      query.page,
      query.pageSize,
    );
  }

  /**
   * The running Results over the Hands the Library filter in the query keeps
   * (the same filter as the list), downsampled to at most `points` points.
   */
  @Get('results')
  @Header('Cache-Control', 'private, no-cache')
  async runningResults(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: Record<string, unknown>,
  ): Promise<Results> {
    const account = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    return this.results.results(
      account,
      parseLibraryFilter(query),
      query.points,
    );
  }

  /**
   * Takes the `handIds` out of the Account's Library, all of them or none.
   * Only this Library's references go: the Hands stay in other Libraries
   * and in any Queue they are in, where the Account alone hears they are no
   * longer in its Library.
   */
  @Delete('hands')
  async remove(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { handIds?: unknown } = {},
  ): Promise<Removal> {
    const account = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    const removal = await this.library.remove(account, body.handIds);
    await this.gateway.libraryChanged(account.id, removal.handIds, false);
    return removal;
  }

  /** Marks a Hand of the Account's Library. Marking it again changes nothing. */
  @Put('hands/:id/mark')
  async mark(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<MarkChange> {
    const account = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    return this.library.setMark(account, id, true);
  }

  /** Takes the Mark off a Hand of the Account's Library. */
  @Delete('hands/:id/mark')
  async unmark(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<MarkChange> {
    const account = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    return this.library.setMark(account, id, false);
  }
}
