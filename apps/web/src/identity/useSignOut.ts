import { useState } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'
import { navigate } from '../routing'
import { useIdentity } from './context'

/**
 * Ends this browser's Sign-in, without asking, and lands on the start. A
 * refusal leaves the person where they were, with the reason.
 */
export function useSignOut(): { signOut: () => void; busy: boolean; failure: FailureReason | null } {
  const { signOut } = useIdentity()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<FailureReason | null>(null)

  async function leave() {
    setBusy(true)
    setFailure(null)
    try {
      await signOut()
      // A Room held behind this page belonged to the identity just signed out.
      navigate('/')
    } catch (error) {
      setFailure(reasonOf(error))
      setBusy(false)
    }
  }

  return { signOut: () => void leave(), busy, failure }
}
