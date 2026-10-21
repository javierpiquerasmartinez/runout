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
): SessionContextValue & { token: string; identity: Identity } {
  return {
    token: 'token',
    identity: {
      id: 'me',
      displayName: 'Javier',
      screenNames: [],
      preferences: DEFAULT_PREFERENCES,
      account: { email: 'javier@example.com' },
      room: null,
      ...identity,
    },
    rememberDisplayName: vi.fn(),
    rememberScreenNames: vi.fn(),
    changePreferences: vi.fn(async () => {}),
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    joinAnonymously: vi.fn(async () => {}),
    forgetEnded: vi.fn(),
    ...actions,
  }
}

/** Someone with no identity yet: they haven't signed in nor joined a Room. */
export function fakeVisitor(
  actions: Partial<Omit<SessionContextValue, 'token' | 'identity'>> = {},
): SessionContextValue & { token: null; identity: null } {
  return { ...fakeSession({}, actions), token: null, identity: null }
}
