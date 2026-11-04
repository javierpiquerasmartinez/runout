import { useEffect } from 'react'
import { redirect } from '../routing'

/** Sends this person to `to` in place of the path they opened, so going back skips it. */
export function Redirect({ to }: { to: string }) {
  useEffect(() => redirect(to), [to])
  return null
}
