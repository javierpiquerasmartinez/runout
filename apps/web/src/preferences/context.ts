import { createContext, useContext } from 'react'
import { DEFAULT_PREFERENCES, type Preferences } from './preferences'

/** The reader's preferences inside a session; the defaults anywhere else (e.g. the design system page). */
export const PreferencesContext = createContext<Preferences>(DEFAULT_PREFERENCES)

export function usePreferences(): Preferences {
  return useContext(PreferencesContext)
}
