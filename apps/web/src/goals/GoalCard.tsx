import { useId, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import type { CalendarDate } from '../calendar/calendar'
import { barFill, countdownOn, goalStatusOn, progressOf, writeAmount, type Countdown, type Goal, type GoalStatus } from './goals'

/** Each Goal Status has a shape of its own, so that it doesn't rest on colour alone. */
const statusMarks: Record<GoalStatus, ReactNode> = {
  notStarted: <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="3" />,
  inProgress: <circle cx="12" cy="12" r="7" fill="currentColor" />,
  achieved: <path d="m4.5 12.8 5 5L19.5 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />,
  expired: (
    <>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="3" />
      <path d="M8.5 12h7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
}

/** The countdown in words; nothing for a Goal that has none. */
function useCountdownText(countdown: Countdown): string | null {
  const { t, formatNumber } = useI18n()
  if (countdown === null) return null
  if (countdown.kind === 'lastDay') return t('goals.countdown.lastDay')
  return t(`goals.countdown.${countdown.kind}.${countdown.days === 1 ? 'one' : 'other'}`, { count: formatNumber(countdown.days) })
}

/** A Goal on its card, as it stands today: its name, its description if it has one, its Goal Status and countdown, its numbers and its Progress. */
export function GoalCard({ goal, today }: { goal: Goal; today: CalendarDate }) {
  const { t, locale, formatNumber } = useI18n()
  const nameId = useId()
  const status = goalStatusOn(goal, today)
  const countdown = useCountdownText(countdownOn(goal, today))
  return (
    <article className="goal-card" data-status={status} aria-labelledby={nameId}>
      <div className="goal-card__heading">
        <h2 id={nameId} className="goal-card__name">
          {goal.name}
        </h2>
        {goal.description !== '' && (
          <p className="goal-card__description" title={goal.description}>
            {goal.description}
          </p>
        )}
      </div>
      <div className="goal-card__standing">
        <span className="goal-card__status">
          <svg className="goal-card__mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {statusMarks[status]}
          </svg>
          {t(`goals.status.${status}`)}
        </span>
        {countdown !== null && <span className="goal-card__countdown">{countdown}</span>}
      </div>
      <div className="goal-card__progress">
        <div className="goal-card__numbers">
          <span className="goal-card__current ro-mono">{writeAmount(goal.currentValue, locale)}</span>
          <span className="goal-card__target ro-mono">{`/ ${writeAmount(goal.target, locale)}`}</span>
          <span className="goal-card__percent ro-mono">{t('goals.card.percent', { percent: formatNumber(progressOf(goal)) })}</span>
        </div>
        <div className="goal-card__bar" aria-hidden="true">
          <div className="goal-card__fill" style={{ width: `${barFill(goal)}%` }} />
        </div>
      </div>
    </article>
  )
}
