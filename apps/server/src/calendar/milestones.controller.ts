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
  Query,
} from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import { IdentityService } from '../identity/identity.service.js';
import { parseCalendarSpan } from './calendar-date.js';
import {
  MilestonesService,
  type Milestone,
  type MilestoneBody,
  type MilestoneChange,
  type MilestoneList,
} from './milestones.service.js';

/**
 * An Account's Milestones, kept in its Calendar. An anonymous identity has no
 * Calendar: `account-required`.
 */
@Controller('calendar/milestones')
export class MilestonesController {
  constructor(
    private readonly identities: IdentityService,
    private readonly milestones: MilestonesService,
  ) {}

  /**
   * The Account's Milestones dated from `from` to `to`, both included, and
   * whether it has any Milestone at all. The span is read as
   * `parseCalendarSpan` describes.
   */
  @Get()
  @Header('Cache-Control', 'private, no-cache')
  async list(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: Record<string, unknown>,
  ): Promise<MilestoneList> {
    const account = await this.authenticate(authorization);
    return this.milestones.list(account, parseCalendarSpan(query));
  }

  /** Creates a Milestone from a title, a description and a date. */
  @Post()
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: MilestoneBody = {},
  ): Promise<Milestone> {
    const account = await this.authenticate(authorization);
    return this.milestones.create(account, body);
  }

  /** One Milestone. Someone else's Milestone is `milestone-not-found`. */
  @Get(':id')
  @Header('Cache-Control', 'private, no-cache')
  async get(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<Milestone> {
    const account = await this.authenticate(authorization);
    return this.milestones.get(account, id);
  }

  /** Deletes a Milestone, for good. Someone else's is `milestone-not-found`. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<void> {
    const account = await this.authenticate(authorization);
    await this.milestones.delete(account, id);
  }

  /**
   * Changes whichever of a Milestone's title, description, date and done are
   * sent. Someone else's Milestone is `milestone-not-found`.
   */
  @Patch(':id')
  async change(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: MilestoneChange = {},
  ): Promise<Milestone> {
    const account = await this.authenticate(authorization);
    return this.milestones.change(account, id, body);
  }

  private authenticate(authorization: string | undefined) {
    return this.identities.authenticateAccount(bearerToken(authorization));
  }
}
