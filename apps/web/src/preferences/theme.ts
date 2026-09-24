import { useEffect } from 'react'
import type { Theme } from './preferences'

const PREFERS_LIGHT = '(prefers-color-scheme: light)'

/**
 * Puts the page in the reader's theme: `data-theme` on <html> picks the
 * tokens. "System" follows the operating system, and keeps following it.
 */
export function useTheme(theme: Theme) {
  useEffect(() => {
    const root = document.documentElement
    if (theme !== 'system') {
      root.dataset.theme = theme
      return
    }
    const query = window.matchMedia?.(PREFERS_LIGHT)
    const follow = () => {
      root.dataset.theme = query?.matches ? 'light' : 'dark'
    }
    follow()
    query?.addEventListener('change', follow)
    return () => query?.removeEventListener('change', follow)
  }, [theme])
}
