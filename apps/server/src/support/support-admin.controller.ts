import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  Administrator,
  AdministratorGuard,
} from '../admin/administrator.guard.js';
import type { Identity } from '../identity/identity.service.js';
import {
  SupportService,
  type NewMessageBody,
  type PanelTicket,
  type PanelTicketPage,
  type PanelWaitingCount,
} from './support.service.js';

/**
 * The panel's Support tab: every Support Ticket, for Administrators only.
 * Anyone else is answered `not-found`, as with the rest of the panel.
 */
@Controller('admin/support/tickets')
@UseGuards(AdministratorGuard)
export class SupportAdminController {
  constructor(private readonly support: SupportService) {}

  /**
   * A page of every Support Ticket, those waiting for an answer first;
   * `status` (`all`, `open`, `closed`) keeps only some.
   */
  @Get()
  @Header('Cache-Control', 'private, no-cache')
  async list(
    @Query() query: { status?: unknown; page?: unknown; pageSize?: unknown },
  ): Promise<PanelTicketPage> {
    return this.support.listForPanel(query);
  }

  /** How many Open Support Tickets wait for an answer, the same for every Administrator. */
  @Get('waiting')
  @Header('Cache-Control', 'private, no-cache')
  async waiting(): Promise<PanelWaitingCount> {
    return this.support.waitingForPanel();
  }

  /** Any Support Ticket and its thread, showing which Administrator wrote each message. */
  @Get(':id')
  @Header('Cache-Control', 'private, no-cache')
  async read(@Param('id') id: string): Promise<PanelTicket> {
    return this.support.readForPanel(id);
  }

  /** Writes a Support Message in any Ticket; its Account sees it signed Runout. */
  @Post(':id/messages')
  async write(
    @Administrator() administrator: Identity,
    @Param('id') id: string,
    @Body() body: NewMessageBody = {},
  ): Promise<PanelTicket> {
    return this.support.writeForPanel(administrator, id, body);
  }

  /** Closes any Support Ticket, answering with the thread; whoever writes in it again opens it. */
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  async close(@Param('id') id: string): Promise<PanelTicket> {
    return this.support.closeForPanel(id);
  }
}
