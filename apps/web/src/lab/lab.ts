/** The Lab ("Laboratorio"): an Account's study tools. Its only tool today is Ranges, so `/lab` leads there. */
export const labPath = '/lab'

/** The Lab's Ranges: the matrix, its stats and the Account's saved Ranges. */
export const labRangesPath = '/lab/ranges'

/** Whether this path is the Lab's or one of its tools'. */
export function isLabPath(path: string): boolean {
  return path === labPath || path.startsWith(`${labPath}/`)
}
