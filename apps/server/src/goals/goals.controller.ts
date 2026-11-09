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
import {
  GoalsService,
  type Goal,
  type GoalBody,
  type GoalChange,
  type GoalList,
} from './goals.service.js';

/**
 * An Account's Goals. An anonymous identity has none: `account-required`.
 */
@Controller('goals')
export class GoalsController {
  constructor(
    private readonly identities: IdentityService,
    private readonly goals: GoalsService,
  ) {}

  /** All the Account's Goals. */
  @Get()
  @Header('Cache-Control', 'private, no-cache')
  async list(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<GoalList> {
    const account = await this.authenticate(authorization);
    return this.goals.list(account);
  }

  /** Creates a Goal from a name, a description, a Target and its two dates. */
  @Post()
  async create(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: GoalBody = {},
  ): Promise<Goal> {
    const account = await this.authenticate(authorization);
    return this.goals.create(account, body);
  }

  /**
   * Changes whichever of a Goal's fields are sent. Someone else's Goal is
   * `goal-not-found`.
   */
  @Patch(':id')
  async change(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: GoalChange = {},
  ): Promise<Goal> {
    const account = await this.authenticate(authorization);
    return this.goals.change(account, id, body);
  }

  /** Deletes a Goal, for good. Someone else's is `goal-not-found`. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<void> {
    const account = await this.authenticate(authorization);
    await this.goals.delete(account, id);
  }

  private authenticate(authorization: string | undefined) {
    return this.identities.authenticateAccount(bearerToken(authorization));
  }
}
