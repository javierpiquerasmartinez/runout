import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Identity, SignedIn } from '../identity/identity.service.js';
import {
  InvitationsService,
  type InvitationSent,
  type InvitationView,
} from '../identity/invitations.service.js';
import {
  AccountsService,
  type AccountsPage,
  type Totals,
} from './accounts.service.js';
import { Administrator, AdministratorGuard } from './administrator.guard.js';
import { RoomsAdminService } from './rooms-admin.service.js';

/**
 * The Administrator panel's API (ADR 0008). Everyone who isn't an
 * Administrator is answered `not-found`: for them it isn't there. The guard
 * covers every endpoint here.
 */
@Controller('admin')
@UseGuards(AdministratorGuard)
export class AdminController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly accounts: AccountsService,
    private readonly rooms: RoomsAdminService,
  ) {}

  @Get('invitations')
  async listInvitations(): Promise<InvitationView[]> {
    return this.invitations.list();
  }

  @Post('invitations')
  async invite(
    @Administrator() administrator: Identity,
    @Body() body: { email?: unknown; language?: unknown } = {},
  ): Promise<InvitationSent> {
    return this.invitations.invite(administrator, body.email, body.language);
  }

  @Post('invitations/:id/resend')
  @HttpCode(HttpStatus.OK)
  async resend(
    @Administrator() administrator: Identity,
    @Param('id') id: string,
  ): Promise<InvitationSent> {
    return this.invitations.resend(administrator, id);
  }

  @Post('invitations/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string): Promise<InvitationView> {
    return this.invitations.cancel(id);
  }

  @Get('accounts')
  async listAccounts(
    @Query() query: Record<string, unknown>,
  ): Promise<AccountsPage> {
    return this.accounts.list(query);
  }

  @Get('totals')
  async totals(): Promise<Totals> {
    return this.accounts.totals();
  }

  @Post('accounts/:id/suspension')
  @HttpCode(HttpStatus.NO_CONTENT)
  async suspend(
    @Administrator() administrator: Identity,
    @Param('id') id: string,
  ): Promise<void> {
    await this.accounts.suspend(administrator, id);
  }

  @Delete('accounts/:id/suspension')
  @HttpCode(HttpStatus.NO_CONTENT)
  async lift(@Param('id') id: string): Promise<void> {
    await this.accounts.lift(id);
  }

  /** Starts an Impersonation: a Sign-in as that Account, for this Administrator. */
  @Post('accounts/:id/impersonations')
  async impersonate(
    @Administrator() administrator: Identity,
    @Param('id') id: string,
  ): Promise<SignedIn> {
    return this.accounts.impersonate(administrator, id);
  }

  @Get('rooms')
  async listRooms(@Query() query: Record<string, unknown>) {
    return this.rooms.list(query);
  }

  @Post('rooms/:code/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  async closeRoom(@Param('code') code: string): Promise<void> {
    await this.rooms.close(code);
  }

  @Post('rooms/:code/end-live')
  @HttpCode(HttpStatus.NO_CONTENT)
  async endLive(@Param('code') code: string): Promise<void> {
    await this.rooms.endLive(code);
  }
}
