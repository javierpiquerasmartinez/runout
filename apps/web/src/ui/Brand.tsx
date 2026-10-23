import { useI18n } from '../i18n'
import { followLink } from '../routing'
import { BrandMark } from './BrandMark'

/**
 * The brand lockup, mark and wordmark, as every header draws it: 19 px,
 * 0.09em apart. It leads to the start, unless a screen gives another `href`
 * and the `label` that says where it goes.
 */
export function Brand({ href = '/', label }: { href?: string; label?: string }) {
  const { t } = useI18n()
  return (
    <a href={href} className="ro-brand" aria-label={label ?? t('room.home')} onClick={followLink}>
      <BrandMark size={22} />
      <span className="ro-serif">{t('brand.wordmark')}</span>
    </a>
  )
}
