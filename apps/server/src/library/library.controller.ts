import {
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
import { parseLibraryFilter } from './library-filter.js';
import {
  LibraryService,
  type LibraryPage,
  type MarkChange,
} from './library.service.js';
import { ResultsService, type Results } from './results.service.js';

@Controller('library')
export class LibraryController {
  constructor(
    private readonly identities: IdentityService,
    private readonly library: LibraryService,
    private readonly results: ResultsService,
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
