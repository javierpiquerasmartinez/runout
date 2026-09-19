import {
  Catch,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { Rejected, type RejectionReason } from './rejection.js';

const statusFor: Record<RejectionReason, HttpStatus> = {
  unauthenticated: HttpStatus.UNAUTHORIZED,
  'invalid-display-name': HttpStatus.BAD_REQUEST,
  'invalid-room-name': HttpStatus.BAD_REQUEST,
  'room-not-found': HttpStatus.NOT_FOUND,
  'not-in-room': HttpStatus.FORBIDDEN,
  'not-master': HttpStatus.FORBIDDEN,
  'hand-not-found': HttpStatus.NOT_FOUND,
  'hand-not-in-queue': HttpStatus.NOT_FOUND,
  'no-hand-loaded': HttpStatus.CONFLICT,
  'invalid-action-index': HttpStatus.BAD_REQUEST,
};

/** Replies to an HTTP request the domain rejected with `{ reason }`. */
@Catch(Rejected)
export class RejectionFilter implements ExceptionFilter {
  catch(rejection: Rejected, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusFor[rejection.reason])
      .json({ reason: rejection.reason });
  }
}
