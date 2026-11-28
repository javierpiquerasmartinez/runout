import { useI18n } from '../i18n'

/**
 * The "×2" mark of a Hand run more than once, with how many times on hover,
 * as the boards "Sala · Una mano con dos runs" and "Biblioteca · Una mano
 * con dos runs" draw it. Nothing for a Hand run once.
 */
export function TimesRun({ count }: { count: number }) {
  const { t } = useI18n()
  if (count < 2) return null
  return (
    <abbr className="times-run ro-mono" title={t('hand.timesRun.title', { count })}>
      {t('hand.timesRun', { count })}
    </abbr>
  )
}
