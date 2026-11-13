import { Module } from '@nestjs/common';
import { FileStoreModule } from '../file-store/file-store.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ImportServiceWakerModule } from '../import-service/import-service-waker.js';
import { StorageModule } from '../storage/storage.js';
import { BulkImportsController } from './bulk-imports.controller.js';
import { BulkImportsService } from './bulk-imports.service.js';
import { StallCheck } from './stall-check.js';

@Module({
  imports: [
    FileStoreModule,
    IdentityModule,
    ImportServiceWakerModule,
    StorageModule,
  ],
  controllers: [BulkImportsController],
  providers: [BulkImportsService, StallCheck],
  exports: [BulkImportsService],
})
export class BulkImportsModule {}
