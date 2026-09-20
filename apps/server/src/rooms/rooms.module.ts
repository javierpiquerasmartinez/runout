import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { ImportsService } from './imports.service.js';
import { MasterService } from './master.service.js';
import { PlaybackService } from './playback.service.js';
import { QueueService } from './queue.service.js';
import { RoomGateway } from './room.gateway.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsService } from './rooms.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [RoomsController],
  providers: [
    RoomsService,
    QueueService,
    ImportsService,
    PlaybackService,
    MasterService,
    RoomGateway,
  ],
})
export class RoomsModule {}
