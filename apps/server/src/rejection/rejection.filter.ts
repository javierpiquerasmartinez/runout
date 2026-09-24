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
  'invalid-screen-names': HttpStatus.BAD_REQUEST,
  'invalid-room-name': HttpStatus.BAD_REQUEST,
  'room-not-found': HttpStatus.NOT_FOUND,
  'not-in-room': HttpStatus.FORBIDDEN,
  'not-master': HttpStatus.FORBIDDEN,
  'not-a-participant': HttpStatus.BAD_REQUEST,
  'already-master': HttpStatus.CONFLICT,
  'master-must-choose': HttpStatus.CONFLICT,
  'cannot-kick-yourself': HttpStatus.BAD_REQUEST,
  'kicked-from-room': HttpStatus.FORBIDDEN,
  'hand-not-found': HttpStatus.NOT_FOUND,
  'hand-not-in-queue': HttpStatus.NOT_FOUND,
  'no-hand-loaded': HttpStatus.CONFLICT,
  'invalid-action-index': HttpStatus.BAD_REQUEST,
  'file-too-large': HttpStatus.PAYLOAD_TOO_LARGE,
  'unreadable-file': HttpStatus.BAD_REQUEST,
  'invalid-format': HttpStatus.BAD_REQUEST,
  'preview-not-found': HttpStatus.NOT_FOUND,
  'author-not-in-room': HttpStatus.BAD_REQUEST,
  'invalid-queue-order': HttpStatus.BAD_REQUEST,
  'entry-not-in-queue': HttpStatus.NOT_FOUND,
  'nothing-to-undo': HttpStatus.NOT_FOUND,
  'undo-expired': HttpStatus.CONFLICT,
  'invalid-note': HttpStatus.BAD_REQUEST,
  'note-not-found': HttpStatus.NOT_FOUND,
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
