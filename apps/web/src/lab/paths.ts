/*
 * The Lab's addresses that anyone's path is checked against, apart from the
 * Lab itself, so that telling them apart loads none of it.
 */

/** The Lab ("Laboratorio"): an Account's study tools. It opens on the Analysis. */
export const labPath = '/lab'

/** Whether this path is the Lab's or one of its tools'. */
export function isLabPath(path: string): boolean {
  return path === labPath || path.startsWith(`${labPath}/`)
}
