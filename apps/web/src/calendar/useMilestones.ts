import { useEffect, useRef, useState } from 'react'
import { useSession } from '../identity/context'
import type { CalendarDate, CalendarSpan, Milestone } from './calendar'
import { changeMilestone, listMilestones, type MilestoneChange } from './milestonesApi'

/** A change to a Milestone that could not be saved and went back: what to say, and of which. */
export interface Unsaved {
  message: 'calendar.milestone.saveFailed' | 'calendar.milestone.moveFailed'
  title: string
}

/** What the Calendar knows of the Account's Milestones for a span. */
interface Fetched {
  /** The span the Milestones are of, and which reading of it. */
  key: string
  milestones: Milestone[]
}

/**
 * The Account's Milestones in the span, asked for again whenever it changes. A Milestone
 * created here is added at once, without asking again, even when the span it
 * lands in is still being asked for. Marking one done or not done, or moving
 * it to another day, shows at once; if saving it fails, it goes back and
 * `unsaved` says so. `reload` asks again, back through loading.
 */
export function useMilestones({ from, to }: CalendarSpan) {
  const { token } = useSession()
  const [attempt, setAttempt] = useState(0)
  const key = `${from}/${to}#${attempt}`
  const [fetched, setFetched] = useState<Fetched | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [unsaved, setUnsaved] = useState<Unsaved | null>(null)
  /** Every Milestone created here, in order: an answer asked for before one was created can't hold it. */
  const created = useRef<Milestone[]>([])

  useEffect(() => {
    let current = true
    const since = created.current.length
    listMilestones(token, { from, to })
      .then(({ milestones }) => {
        if (!current) return
        const missed = created.current.slice(since).filter(({ id, date }) => date >= from && date <= to && !milestones.some((held) => held.id === id))
        setFetched({ key, milestones: [...milestones, ...missed] })
      })
      .catch(() => current && setFailedKey(key))
    return () => {
      current = false
    }
  }, [key, from, to, token])

  /** Changes one Milestone held, wherever the Milestones held are of. */
  function hold(id: string, changed: Partial<Milestone>) {
    setFetched((before) => before && { ...before, milestones: before.milestones.map((m) => (m.id === id ? { ...m, ...changed } : m)) })
  }

  /** Shows a change at once and saves it; if saving fails, `undo` puts it back and `unsaved` says so. */
  function changeAtOnce(milestone: Milestone, change: MilestoneChange, undo: MilestoneChange, message: Unsaved['message']) {
    setUnsaved(null)
    hold(milestone.id, change)
    changeMilestone(token, milestone.id, change).catch(() => {
      hold(milestone.id, undo)
      setUnsaved({ message, title: milestone.title })
    })
  }

  const fresh = fetched?.key === key
  return {
    milestones: fresh ? fetched.milestones : [],
    loading: !fresh && failedKey !== key,
    failed: failedKey === key,
    reload: () => setAttempt((n) => n + 1),
    add(milestone: Milestone) {
      created.current.push(milestone)
      setFetched((before) => {
        const within = milestone.date >= from && milestone.date <= to
        if (!before || before.key !== key) return before
        return { ...before, milestones: within ? [...before.milestones, milestone] : before.milestones }
      })
    },
    unsaved,
    setDone(milestone: Milestone, done: boolean) {
      changeAtOnce(milestone, { done }, { done: milestone.done }, 'calendar.milestone.saveFailed')
    },
    move(milestone: Milestone, date: CalendarDate) {
      changeAtOnce(milestone, { date }, { date: milestone.date }, 'calendar.milestone.moveFailed')
    },
  }
}
