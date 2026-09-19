import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { QueueService } from './queue.service.js';
import { RoomGateway } from './room.gateway.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsService } from './rooms.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [RoomsController],
  providers: [RoomsService, QueueService, RoomGateway],
})
export class RoomsModule {}
