import { useI18n } from '../i18n'
import { followLink } from '../routing'
import { BrandMark } from './BrandMark'

/**
 * The brand lockup, mark and wordmark, as every header draws it: 19 px,
 * 0.09em apart, or the "Bienvenida" board's 27 px, 0.1em apart, on the landing
 * and `/login`. It leads to the start, unless a screen gives another `href`
 * and the `label` that says where it goes.
 */
export function Brand({
  href = '/',
  label,
  size = 'header',
}: {
  href?: string
  label?: string
  size?: 'header' | 'landing'
}) {
  const { t } = useI18n()
  const landing = size === 'landing'
  return (
    <a
      href={href}
      className={landing ? 'ro-brand ro-brand--landing' : 'ro-brand'}
      aria-label={label ?? t('room.home')}
      onClick={followLink}
    >
      <BrandMark size={landing ? 26 : 22} />
      <span className="ro-serif">{t('brand.wordmark')}</span>
    </a>
  )
}
