import { Controller, Get, Header, Headers, Query } from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import { IdentityService } from '../identity/identity.service.js';
import { LibraryService, type LibraryPage } from './library.service.js';

@Controller('library')
export class LibraryController {
  constructor(
    private readonly identities: IdentityService,
    private readonly library: LibraryService,
  ) {}

  /**
   * One page of the Account's Library, newest first, with its total. An
   * anonymous identity has no Library: `account-required`.
   */
  @Get('hands')
  @Header('Cache-Control', 'private, no-cache')
  async hands(
    @Headers('authorization') authorization: string | undefined,
    @Query('page') page: unknown,
    @Query('pageSize') pageSize: unknown,
  ): Promise<LibraryPage> {
    const owner = await this.identities.authenticateAccount(
      bearerToken(authorization),
    );
    return this.library.page(owner, page, pageSize);
  }
}
