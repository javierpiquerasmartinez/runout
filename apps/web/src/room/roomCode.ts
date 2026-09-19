/** A stored Room Code as people read it: two groups of four, with a dash. */
export function formatRoomCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

export function roomPath(code: string): string {
  return `/room/${code}`
}

export function roomLink(code: string, origin: string = window.location.origin): string {
  return `${origin}${roomPath(code)}`
}

/** The code in a `/room/<code>` path, or null for any other path. */
export function roomCodeFromPath(path: string): string | null {
  return path.match(/^\/room\/([^/]+)\/?$/)?.[1] ?? null
}
