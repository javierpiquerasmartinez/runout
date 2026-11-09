import { useEffect, useRef, useState } from 'react'
import { reasonOf } from '../backend/api'
import { useSession } from '../identity/context'
import type { Goal } from './goals'
import { changeGoal, createGoal, deleteGoal, listGoals, type NewGoal } from './goalsApi'

/**
 * The Account's Goals, and how asking for them went. A Goal created here is
 * added at once, without asking again. A new Current Value shows at once,
 * while it is saved. Everything sent about one Goal goes one after the other,
 * so that the last one to reach the server is the last one asked for.
 */
export function useGoals() {
  const { token } = useSession()
  const [saved, setSaved] = useState<Goal[]>([])
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading')
  /** The value shown for each Goal with a save of its Current Value under way. */
  const [unsaved, setUnsaved] = useState<Record<string, number>>({})
  /** The last thing sent about each Goal that has had something sent. */
  const lastSent = useRef(new Map<string, Promise<unknown>>())
  /** The latest save of the Current Value of each Goal that has had one. */
  const valueSaves = useRef(new Map<string, Promise<Goal>>())

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

  /** Sends this about a Goal once whatever was sent before it has been answered, however that went. */
  const inTurn = <T>(id: string, send: () => Promise<T>): Promise<T> => {
    const turn = (lastSent.current.get(id) ?? Promise.resolve()).catch(() => undefined).then(send)
    lastSent.current.set(id, turn)
    return turn
  }

  const replaceSaved = (goal: Goal) => setSaved((before) => before.map((other) => (other.id === goal.id ? goal : other)))

  /** Saves a new Current Value. Rejects if it can't be saved and no later value has taken its place. */
  const changeCurrentValue = async (id: string, currentValue: number): Promise<void> => {
    setUnsaved((before) => ({ ...before, [id]: currentValue }))
    const save = inTurn(id, () => changeGoal(token, id, { currentValue }))
    valueSaves.current.set(id, save)
    const isLatest = () => valueSaves.current.get(id) === save
    try {
      replaceSaved(await save)
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
    create: async (fields: NewGoal): Promise<void> => {
      const goal = await createGoal(token, fields)
      setSaved((before) => [...before, goal])
    },
    changeCurrentValue,
    /** Saves what the dialog holds, after any save of the Current Value still under way. */
    edit: async (id: string, fields: NewGoal): Promise<void> => {
      replaceSaved(await inTurn(id, () => changeGoal(token, id, fields)))
    },
    /** Deletes a Goal; one that was already gone goes from the list just the same. */
    remove: async (id: string): Promise<void> => {
      await inTurn(id, () =>
        deleteGoal(token, id).catch((error: unknown) => {
          if (reasonOf(error) !== 'goal-not-found') throw error
        }),
      )
      setSaved((before) => before.filter((goal) => goal.id !== id))
    },
  }
}
