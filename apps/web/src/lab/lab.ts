/** The Lab ("Laboratorio"): an Account's study tools. Its only tool today is Ranges, so `/lab` leads there. */
export const labPath = '/lab'

/** The Lab's Ranges: the matrix, its stats and the Account's saved Ranges. */
export const labRangesPath = '/lab/ranges'

/** Whether this path is the Lab's or one of its tools'. */
export function isLabPath(path: string): boolean {
  return path === labPath || path.startsWith(`${labPath}/`)
}

/** A saved Range's own address, which survives a reload and going back. */
export function labRangePath(id: string): string {
  return `${labRangesPath}/${encodeURIComponent(id)}`
}

/** The Range this path opens, or null when it opens none. */
export function labRangeIdFromPath(path: string): string | null {
  const match = /^\/lab\/ranges\/([^/]+)$/.exec(path)
  return match ? decodeURIComponent(match[1]) : null
}
