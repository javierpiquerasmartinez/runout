import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { bearerToken } from '../identity/bearer-token.js';
import { IdentityService } from '../identity/identity.service.js';
import {
  SupportService,
  type AccountTicket,
  type AccountTicketList,
  type NewMessageBody,
  type NewTicketBody,
} from './support.service.js';

/**
 * An Account's Support Tickets. An anonymous identity has none
 * (`account-required`), and none is reached while Impersonating
 * (`impersonation-not-allowed`).
 */
@Controller('support/tickets')
export class SupportController {
  constructor(
    private readonly identities: IdentityService,
    private readonly support: SupportService,
  ) {}

  /** The Account's Support Tickets, Open ones first. */
  @Get()
  @Header('Cache-Control', 'private, no-cache')
  async list(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<AccountTicketList> {
    return this.support.listForAccount(await this.authenticate(authorization));
  }

  /** Opens a Support Ticket from a subject and a first message. */
  @Post()
  async open(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: NewTicketBody = {},
  ): Promise<AccountTicket> {
    return this.support.openForAccount(
      await this.authenticate(authorization),
      body,
    );
  }

  /** One of the Account's Support Tickets and its thread; anyone else's is `support-ticket-not-found`. */
  @Get(':id')
  @Header('Cache-Control', 'private, no-cache')
  async read(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<AccountTicket> {
    return this.support.readForAccount(
      await this.authenticate(authorization),
      id,
    );
  }

  /** Writes a Support Message in one of the Account's Tickets, answering with the thread. */
  @Post(':id/messages')
  async write(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: NewMessageBody = {},
  ): Promise<AccountTicket> {
    return this.support.writeForAccount(
      await this.authenticate(authorization),
      id,
      body,
    );
  }

  /** Closes one of the Account's Support Tickets, answering with the thread; writing in it again opens it. */
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  async close(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ): Promise<AccountTicket> {
    return this.support.closeForAccount(
      await this.authenticate(authorization),
      id,
    );
  }

  private authenticate(authorization: string | undefined) {
    return this.identities.authenticateAccount(bearerToken(authorization));
  }
}
