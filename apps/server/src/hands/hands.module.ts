import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { HandsController } from './hands.controller.js';
import { HandsService } from './hands.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [HandsController],
  providers: [HandsService],
})
export class HandsModule {}
