import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { MarksService } from './marks.service.js';
import { MasterService } from './master.service.js';
import { NotesService } from './notes.service.js';
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
    PlaybackService,
    MasterService,
    NotesService,
    MarksService,
    RoomGateway,
  ],
  exports: [
    RoomsService,
    QueueService,
    RoomGateway,
    NotesService,
    MarksService,
  ],
})
export class RoomsModule {}
