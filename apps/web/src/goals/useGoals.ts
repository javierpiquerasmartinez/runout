import { useEffect, useRef, useState } from 'react'
import { useSession } from '../identity/context'
import type { Goal } from './goals'
import { changeGoal, listGoals } from './goalsApi'

/**
 * The Account's Goals, and how asking for them went. A Goal created here is
 * added at once, without asking again. A new Current Value shows at once,
 * while it is saved; the saves of one Goal go one after the other, so that the
 * last one to reach the server is the last one typed.
 */
export function useGoals() {
  const { token } = useSession()
  const [saved, setSaved] = useState<Goal[]>([])
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading')
  /** The value shown for each Goal with a save under way. */
  const [unsaved, setUnsaved] = useState<Record<string, number>>({})
  /** The latest save of each Goal that has had one. */
  const saves = useRef(new Map<string, Promise<Goal>>())

  useEffect(() => {
    let current = true
    listGoals(token)
      .then((list) => {
        if (!current) return
        setSaved(list.goals)
        setStatus('loaded')
      })
      .catch(() => current && setStatus('failed'))
    return () => {
      current = false
    }
  }, [token])

  /** Saves a new Current Value. Rejects if it can't be saved and no later save has taken its place. */
  const changeCurrentValue = async (id: string, currentValue: number): Promise<void> => {
    setUnsaved((before) => ({ ...before, [id]: currentValue }))
    const previous = saves.current.get(id) ?? Promise.resolve()
    const save = previous.catch(() => undefined).then(() => changeGoal(token, id, { currentValue }))
    saves.current.set(id, save)
    const isLatest = () => saves.current.get(id) === save
    try {
      const goal = await save
      setSaved((before) => before.map((other) => (other.id === id ? goal : other)))
    } catch (failure) {
      if (isLatest()) throw failure
    } finally {
      if (isLatest()) {
        setUnsaved(({ [id]: _settled, ...rest }) => rest)
      }
    }
  }

  return {
    goals: saved.map((goal) => (goal.id in unsaved ? { ...goal, currentValue: unsaved[goal.id] } : goal)),
    status,
    add: (goal: Goal) => setSaved((before) => [...before, goal]),
    changeCurrentValue,
  }
}
