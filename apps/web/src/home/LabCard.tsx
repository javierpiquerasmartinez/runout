import { api } from '../backend/api'
import { useI18n } from '../i18n'
import type { RangeSummary } from '../lab/AnalysisSideSection'
import { labAnalysisPath, labRangesPath } from '../lab/lab'
import { Icon } from '../ui/Icon'
import { HomeCard, HomeCardLink, HomeCardMessage } from './HomeCard'
import { useCardRead } from './useCardRead'
import './LabCard.css'

const readRanges = (token: string) => api<RangeSummary[]>('/lab/ranges', { token })

/** How many Ranges the Account has, and the ways into the Lab. */
export function LabCard() {
  const { t } = useI18n()
  const { status, data: ranges, reload } = useCardRead(readRanges)
  return (
    <HomeCard title={t('header.nav.lab')} href={labAnalysisPath} status={status} onRetry={reload}>
      {ranges?.length === 0 && (
        <HomeCardMessage title={t('home.lab.empty.title')} text={t('home.lab.empty.text')}>
          <HomeCardLink look="button" href={labRangesPath}>
            <Icon name="add" size={14} />
            {t('home.lab.empty.create')}
          </HomeCardLink>
        </HomeCardMessage>
      )}
      {ranges && ranges.length > 0 && (
        <>
          <div className="lab-card__count">
            <span className="lab-card__number ro-mono">{ranges.length}</span>
            <span className="lab-card__unit">{t(ranges.length === 1 ? 'home.lab.ranges.one' : 'home.lab.ranges.other')}</span>
          </div>
          <div className="lab-card__ways">
            <HomeCardLink look="button" href={labAnalysisPath}>{t('lab.analysis')}</HomeCardLink>
            <HomeCardLink look="button" href={labRangesPath}>{t('lab.nav.ranges')}</HomeCardLink>
          </div>
        </>
      )}
    </HomeCard>
  )
}
