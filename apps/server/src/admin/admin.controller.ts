import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import {
  IdentityService,
  type Identity,
  type SignedIn,
} from '../identity/identity.service.js';
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
import { RoomsAdminService } from './rooms-admin.service.js';

/**
 * The Administrator panel's API (ADR 0008). Everyone who isn't an
 * Administrator is answered `not-found`: for them it isn't there.
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly identities: IdentityService,
    private readonly invitations: InvitationsService,
    private readonly accounts: AccountsService,
    private readonly rooms: RoomsAdminService,
  ) {}

  private administrator(authorization: string | undefined): Promise<Identity> {
    return this.identities.authenticateAdministrator(
      bearerToken(authorization),
    );
  }

  @Get('invitations')
  async listInvitations(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<InvitationView[]> {
    await this.administrator(authorization);
    return this.invitations.list();
  }

  @Post('invitations')
  async invite(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { email?: unknown; language?: unknown } = {},
  ): Promise<InvitationSent> {
    return this.invitations.invite(
      await this.administrator(authorization),
      body.email,
      body.language,
    );
  }

  @Post('invitations/:id/resend')
  @HttpCode(HttpStatus.OK)
  async resend(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<InvitationSent> {
    return this.invitations.resend(await this.administrator(authorization), id);
  }

  @Post('invitations/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<InvitationView> {
    await this.administrator(authorization);
    return this.invitations.cancel(id);
  }

  @Get('accounts')
  async listAccounts(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: Record<string, unknown>,
  ): Promise<AccountsPage> {
    await this.administrator(authorization);
    return this.accounts.list(query);
  }

  @Get('totals')
  async totals(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<Totals> {
    await this.administrator(authorization);
    return this.accounts.totals();
  }

  @Post('accounts/:id/suspension')
  @HttpCode(HttpStatus.NO_CONTENT)
  async suspend(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<void> {
    await this.accounts.suspend(await this.administrator(authorization), id);
  }

  @Delete('accounts/:id/suspension')
  @HttpCode(HttpStatus.NO_CONTENT)
  async lift(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<void> {
    await this.administrator(authorization);
    await this.accounts.lift(id);
  }

  /** Starts an Impersonation: a Sign-in as that Account, for this Administrator. */
  @Post('accounts/:id/impersonations')
  async impersonate(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<SignedIn> {
    return this.accounts.impersonate(
      await this.administrator(authorization),
      id,
    );
  }

  @Get('rooms')
  async listRooms(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: Record<string, unknown>,
  ) {
    await this.administrator(authorization);
    return this.rooms.list(query);
  }

  @Post('rooms/:code/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  async closeRoom(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
  ): Promise<void> {
    await this.administrator(authorization);
    await this.rooms.close(code);
  }
}
