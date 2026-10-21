import { vi } from 'vitest'
import type { SessionContextValue } from '../identity/context'
import type { Identity } from '../identity/identity'
import { DEFAULT_PREFERENCES } from '../preferences/preferences'

/**
 * A signed-in Account named Javier, for rendering screens under
 * `SessionContext`. Pass what a test needs to differ; every action is a spy.
 */
export function fakeSession(
  identity: Partial<Identity> = {},
  actions: Partial<Omit<SessionContextValue, 'token' | 'identity'>> = {},
) {
  return {
    token: 'token',
    identity: {
      id: 'me',
      displayName: 'Javier',
      screenNames: [],
      preferences: DEFAULT_PREFERENCES,
      account: { email: 'javier@example.com' },
      ...identity,
    },
    rememberDisplayName: vi.fn(),
    rememberScreenNames: vi.fn(),
    changePreferences: vi.fn(async () => {}),
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    ...actions,
  }
}
