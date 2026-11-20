import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { SupportAdminController } from './support-admin.controller.js';
import { SupportController } from './support.controller.js';
import { SupportEmail } from './support-email.js';
import { SupportService } from './support.service.js';

/**
 * Support: Support Tickets between Accounts and the Administrators. Every
 * rule about them lives here, behind two interfaces: the Account's, over its
 * own Tickets, and the Administrators', over every Ticket.
 */
@Module({
  imports: [IdentityModule],
  controllers: [SupportController, SupportAdminController],
  providers: [SupportService, SupportEmail],
})
export class SupportModule {}
