import { useId } from 'react'
import { useI18n } from '../i18n'
import { barFill, progressOf, writeAmount, type Goal } from './goals'

/** A Goal on its card: its name, its description if it has one, its numbers and its Progress. */
export function GoalCard({ goal }: { goal: Goal }) {
  const { t, locale, formatNumber } = useI18n()
  const nameId = useId()
  return (
    <article className="goal-card" aria-labelledby={nameId}>
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
