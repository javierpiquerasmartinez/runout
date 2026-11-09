import { useEffect, useState } from 'react'
import { todayOf, type CalendarDate } from '../calendar/calendar'

/** How long from `now` until the next midnight on the browser's own clock. */
function untilNextMidnight(now: Date): number {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return nextMidnight.getTime() - now.getTime()
}

/**
 * Today in the browser's own zone, kept true in a tab left open: worked out
 * again at each local midnight and on coming back to the tab, whose timers
 * the browser may have held back while it was hidden.
 */
export function useToday(): CalendarDate {
  const [today, setToday] = useState(() => todayOf())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      setToday(todayOf())
      timer = setTimeout(refresh, untilNextMidnight(new Date()))
    }
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    refresh()
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [])

  return today
}
