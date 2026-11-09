import { useId } from 'react'
import { useI18n } from '../i18n'
import type { CalendarDate } from '../calendar/calendar'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { GoalNumbers } from './GoalNumbers'
import { barFill, countdownOn, goalStatusOn, type Countdown, type Goal, type GoalStatus } from './goals'

/** Each Goal Status has a shape of its own, so that it doesn't rest on colour alone. */
const statusMarks: Record<GoalStatus, IconName> = {
  notStarted: 'goal-not-started',
  inProgress: 'goal-in-progress',
  achieved: 'goal-achieved',
  expired: 'goal-expired',
}

/** The countdown in words; nothing for a Goal that has none. */
function useCountdownText(countdown: Countdown): string | null {
  const { t, formatNumber } = useI18n()
  if (countdown === null) return null
  if (countdown.kind === 'lastDay') return t('goals.countdown.lastDay')
  return t(`goals.countdown.${countdown.kind}.${countdown.days === 1 ? 'one' : 'other'}`, { count: formatNumber(countdown.days) })
}

/** A Goal on its card, as it stands today: its name, its description if it has one, its Goal Status and countdown, its numbers and its Progress. */
export function GoalCard({
  goal,
  today,
  onChangeValue,
  onEdit,
}: {
  goal: Goal
  today: CalendarDate
  onChangeValue: (value: number) => Promise<void>
  onEdit: () => void
}) {
  const { t } = useI18n()
  const nameId = useId()
  const status = goalStatusOn(goal, today)
  const countdown = useCountdownText(countdownOn(goal, today))
  return (
    <article className="goal-card" data-status={status} aria-labelledby={nameId}>
      <div className="goal-card__heading">
        <div className="goal-card__top">
          <h2 id={nameId} className="goal-card__name">
            {goal.name}
          </h2>
          <IconButton icon="edit" size="compact" className="goal-card__edit" label={t('goals.card.edit', { name: goal.name })} onClick={onEdit} />
        </div>
        {goal.description !== '' && (
          <p className="goal-card__description" title={goal.description}>
            {goal.description}
          </p>
        )}
      </div>
      <div className="goal-card__standing">
        <span className="goal-card__status">
          <Icon name={statusMarks[status]} size={12} className="goal-card__mark" />
          {t(`goals.status.${status}`)}
        </span>
        {countdown !== null && <span className="goal-card__countdown">{countdown}</span>}
      </div>
      <div className="goal-card__progress">
        <GoalNumbers goal={goal} onChangeValue={onChangeValue} />
        <div className="goal-card__bar" aria-hidden="true">
          <div className="goal-card__fill" style={{ width: `${barFill(goal)}%` }} />
        </div>
      </div>
    </article>
  )
}
