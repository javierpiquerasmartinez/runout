import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import { IdentityService } from '../identity/identity.service.js';
import {
  RangesService,
  type Range,
  type RangeBody,
  type RangeSummary,
} from './ranges.service.js';

/**
 * An Account's Ranges, kept in its Lab. An anonymous identity has no Lab:
 * `account-required`.
 */
@Controller('lab/ranges')
export class RangesController {
  constructor(
    private readonly identities: IdentityService,
    private readonly ranges: RangesService,
  ) {}

  /** The Account's Ranges, each with how wide it is but not its Combos. */
  @Get()
  @Header('Cache-Control', 'private, no-cache')
  async list(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<RangeSummary[]> {
    const account = await this.authenticate(authorization);
    return this.ranges.list(account);
  }

  /** One of the Account's Ranges, with its Combos. */
  @Get(':id')
  @Header('Cache-Control', 'private, no-cache')
  async get(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<Range> {
    const account = await this.authenticate(authorization);
    return this.ranges.get(account, id);
  }

  /** Creates a Range from a name and its Combos. */
  @Post()
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: RangeBody = {},
  ): Promise<Range> {
    const account = await this.authenticate(authorization);
    return this.ranges.create(account, body);
  }

  /** Saves one of the Account's Ranges with a name and its Combos. */
  @Put(':id')
  async save(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: RangeBody = {},
  ): Promise<Range> {
    const account = await this.authenticate(authorization);
    return this.ranges.save(account, id, body);
  }

  private authenticate(authorization: string | undefined) {
    return this.identities.authenticateAccount(bearerToken(authorization));
  }
}
