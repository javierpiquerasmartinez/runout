/*
 * The Calendar's addresses that anyone's path is checked against, apart from
 * the Calendar itself, so that telling them apart loads none of it.
 */

/** The Calendar ("Calendario"): an Account's study plan. It opens on the current month. */
export const calendarPath = '/calendar'

/** Whether this path is the Calendar's or one of its views' or Milestones'. */
export function isCalendarPath(path: string): boolean {
  return path === calendarPath || path.startsWith(`${calendarPath}/`)
}
