import { Module } from '@nestjs/common';
import { FileStoreModule } from '../file-store/file-store.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ImportServiceWakerModule } from '../import-service/import-service-waker.js';
import { BulkImportsController } from './bulk-imports.controller.js';
import { BulkImportsService } from './bulk-imports.service.js';

@Module({
  imports: [FileStoreModule, IdentityModule, ImportServiceWakerModule],
  controllers: [BulkImportsController],
  providers: [BulkImportsService],
})
export class BulkImportsModule {}
