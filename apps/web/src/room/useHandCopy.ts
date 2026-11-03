import { useEffect, useRef, useState } from 'react'
import { apiText } from '../backend/api'
import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n/catalogue'
import { useIdentity } from '../identity/context'
import { copyText } from '../ui/clipboard'

/** A version of a Hand to copy: its Hand Summary, the "Resumen", or its Hand History as it came in, the "Original". */
export type HandCopyVersion = 'summary' | 'history'

/** What each version is called, in the menu and in "Mano copiada · Resumen". */
export const VERSION_LABELS: Record<HandCopyVersion, MessageKey> = {
  summary: 'hand.copy.summary',
  history: 'hand.copy.history',
}

/** How the last copy went, for a moment after it. */
export type CopyFeedback = { copied: HandCopyVersion } | { failed: true }

/** How long the control says how the copy went. */
const FEEDBACK_FOR_MS = 2000

/**
 * Copies a whole Hand as text, fetched from the server after the click, in
 * the UI language and the browser's time zone; and says, for a moment, which
 * version was copied or that it couldn't be. Null until something is copied.
 */
export function useHandCopy(handId: string): {
  copy: (version: HandCopyVersion) => void
  /** "Mano copiada · Resumen", or why not; null when there is nothing to say. */
  message: string | null
  feedback: CopyFeedback | null
} {
  const { t, locale } = useI18n()
  const { token } = useIdentity()
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  function copy(version: HandCopyVersion) {
    const query = new URLSearchParams({
      as: version,
      language: locale,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    const text = apiText(`/hands/${encodeURIComponent(handId)}/copy?${query}`, { token })
    void copyText(text).then((done) => {
      setFeedback(done ? { copied: version } : { failed: true })
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setFeedback(null), FEEDBACK_FOR_MS)
    })
  }

  const message =
    feedback === null
      ? null
      : 'failed' in feedback
        ? t('hand.copy.failed')
        : t('hand.copy.copied', { version: t(VERSION_LABELS[feedback.copied]) })
  return { copy, message, feedback }
}
