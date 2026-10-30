import { useI18n } from '../i18n'
import { followLink } from '../routing'
import { labAnalysisPath, labRangesPath } from './lab'

/** "Análisis | Rangos": the Lab's two screens, the one this person is on marked. */
export function LabNav({ current }: { current: 'analysis' | 'ranges' }) {
  const { t } = useI18n()
  const screens = [
    { screen: 'analysis', href: labAnalysisPath, label: t('lab.analysis') },
    { screen: 'ranges', href: labRangesPath, label: t('lab.nav.ranges') },
  ] as const
  return (
    <nav className="lab__nav" aria-label={t('header.nav.lab')}>
      {screens.map(({ screen, href, label }) => (
        <a
          key={screen}
          href={href}
          className="lab__nav-item"
          aria-current={screen === current ? 'page' : undefined}
          onClick={followLink}
        >
          {label}
        </a>
      ))}
    </nav>
  )
}
