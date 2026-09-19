import {
  Catch,
  PayloadTooLargeException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { RejectionFilter } from './rejection.filter.js';
import { Rejected } from './rejection.js';

/**
 * Replies to an upload over the size limit like any other refusal, as
 * `file-too-large`, instead of with Nest's own error body.
 */
@Catch(PayloadTooLargeException)
export class FileTooLargeFilter implements ExceptionFilter {
  catch(_: PayloadTooLargeException, host: ArgumentsHost): void {
    new RejectionFilter().catch(new Rejected('file-too-large'), host);
  }
}
