/** The part of Google Identity Services' `google.accounts.id` Runout uses. */
export interface GoogleIdentity {
  initialize(config: { client_id: string; callback: (response: { credential: string }) => void }): void
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard'
      theme?: 'outline' | 'filled_black'
      size?: 'large'
      text?: 'signin_with' | 'continue_with'
      shape?: 'rectangular'
      logo_alignment?: 'left' | 'center'
      /** In pixels; Google draws it at most 400 wide. */
      width?: number
      locale?: string
    },
  ): void
  /** After signing out, so Google doesn't sign the same account straight back in. */
  disableAutoSelect(): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } }
  }
}

const SCRIPT_URL = 'https://accounts.google.com/gsi/client'

/** The OAuth client ID ID tokens are asked for; the server checks them against the same one. */
export function googleClientId(): string | undefined {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || undefined
}

let loading: Promise<GoogleIdentity> | null = null

/** Google Identity Services, loading its script the first time it is needed. */
export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id)
  loading ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => (window.google ? resolve(window.google.accounts.id) : reject(new Error('no google')))
    script.onerror = () => reject(new Error('google script failed'))
    document.head.append(script)
  }).catch((error: unknown) => {
    loading = null
    throw error
  })
  return loading
}
