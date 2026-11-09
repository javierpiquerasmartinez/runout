import { useEffect, useState } from 'react'
import { useSession } from '../identity/context'
import type { Goal } from './goals'
import { listGoals } from './goalsApi'

/** The Account's Goals, and how asking for them went. A Goal created here is added at once, without asking again. */
export function useGoals() {
  const { token } = useSession()
  const [goals, setGoals] = useState<Goal[]>([])
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading')

  useEffect(() => {
    let current = true
    listGoals(token)
      .then((list) => {
        if (!current) return
        setGoals(list.goals)
        setStatus('loaded')
      })
      .catch(() => current && setStatus('failed'))
    return () => {
      current = false
    }
  }, [token])

  return {
    goals,
    status,
    add: (goal: Goal) => setGoals((before) => [...before, goal]),
  }
}
