import { useI18n } from '../i18n'
import { followLink } from '../routing'
import { BrandMark } from './BrandMark'

/** The brand lockup, mark and wordmark, as every header draws it: 19 px, 0.09em apart. */
export function Brand() {
  const { t } = useI18n()
  return (
    <a href="/" className="ro-brand" aria-label={t('room.home')} onClick={followLink}>
      <BrandMark size={22} />
      <span className="ro-serif">{t('brand.wordmark')}</span>
    </a>
  )
}
