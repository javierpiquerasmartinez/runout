import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { RoomGateway } from './room.gateway.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsService } from './rooms.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomGateway],
})
export class RoomsModule {}
