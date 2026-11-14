import { roomPath } from '../room/roomCode'

/*
 * The Library's addresses that anyone's path is checked against, apart from
 * the Library itself, so that telling them apart loads none of it.
 */

export const libraryPath = '/library'

/** Where a Participant picks Hands of their Library to add to the Room's Queue, still in the Room. */
export function roomLibraryPath(code: string): string {
  return `${roomPath(code)}${libraryPath}`
}

/** The Room Code in a Room's Library path, or null for any other path. */
export function roomCodeFromLibraryPath(path: string): string | null {
  return path.match(/^\/room\/([^/]+)\/library\/?$/)?.[1] ?? null
}
