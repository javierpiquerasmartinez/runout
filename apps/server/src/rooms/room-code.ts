import { randomInt } from 'node:crypto';

/** No 0/O, 1/I/L: nothing that reads or sounds like another character. */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 8;

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** A typed code as stored: dash, spaces and case ignored. */
export function normalizeRoomCode(typed: string): string {
  return typed.replace(/[\s-]/g, '').toUpperCase();
}
