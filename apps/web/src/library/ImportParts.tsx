import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import './ImportParts.css'

/*
 * What the Library's Importaciones view and the Administration's
 * Importaciones tab show alike of a Bulk Import.
 */

/** How far an import has gone, "412.000 de 1.240.000", over a bar in its tone. */
export function ImportProgress({
  processed,
  total,
  tone,
  className,
}: {
  processed: number
  total: number
  tone: 'brass' | 'alert' | 'muted'
  className?: string
}) {
  const { t, formatNumber } = useI18n()
  return (
    <>
      <div className={className ? `${className} ro-mono` : 'ro-mono'}>
        {t('library.imports.progress', { processed: formatNumber(processed), total: formatNumber(total) })}
      </div>
      <span className="import-progress" data-tone={tone} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={processed}>
        <span className="import-progress__fill" style={{ width: `${total > 0 ? (100 * processed) / total : 0}%` }} />
      </span>
    </>
  )
}

/**
 * A message with an element in its middle, as "{code} tras 3 intentos" with
 * the code set apart: `write` gives the message with a placeholder where it
 * goes.
 */
export function Wrapped({ write, children }: { write: (slot: string) => string; children: ReactNode }) {
  const [before, after = ''] = write('\u0000').split('\u0000')
  return (
    <>
      {before}
      {children}
      {after}
    </>
  )
}
