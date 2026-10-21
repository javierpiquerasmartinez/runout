import { vi } from 'vitest'

/**
 * Stands in for Google Identity Services on `window.google`: its button is a
 * plain "Sign in with Google" button that hands back `credential` when clicked.
 */
export function fakeGoogleIdentity(credential = 'google-id-token') {
  let callback: ((response: { credential: string }) => void) | null = null
  const id = {
    initialize: vi.fn((config: { client_id: string; callback: (response: { credential: string }) => void }) => {
      callback = config.callback
    }),
    renderButton: vi.fn((parent: HTMLElement) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = 'Sign in with Google'
      button.addEventListener('click', () => callback?.({ credential }))
      parent.replaceChildren(button)
    }),
    disableAutoSelect: vi.fn(),
  }
  vi.stubGlobal('google', { accounts: { id } })
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id')
  return id
}
