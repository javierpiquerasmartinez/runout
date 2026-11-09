import { useState } from 'react'
import { todayOf, type CalendarDate } from '../calendar/calendar'
import { GoalNumbers } from '../goals/GoalNumbers'
import { barFill, goalsPath, goalStatusOn, orderGoals, type Goal } from '../goals/goals'
import { useGoals } from '../goals/useGoals'
import { useI18n } from '../i18n'
import { followLink } from '../routing'
import { Icon } from '../ui/Icon'
import { HomeCard, HomeCardLink, HomeCardMessage } from './HomeCard'
import '../goals/GoalsPage.css'
import './GoalsCard.css'

/** How many Goals the card shows at most. */
const MOST_SHOWN = 5

/** The Goals the card shows on a given day: those In Progress, as the Goals screen orders them. */
const selectGoals = (goals: readonly Goal[], today: CalendarDate) =>
  orderGoals(goals, today)
    .filter((goal) => goalStatusOn(goal, today) === 'inProgress')
    .slice(0, MOST_SHOWN)

/**
 * A bar for each Goal In Progress. Which Goals those are is settled once and
 * then held, so that a change of Current Value updates its row and a Goal that
 * has just been Achieved stays where it is until they are selected again.
 */
export function GoalsCard() {
  const { t } = useI18n()
  const { goals, status, reload, changeCurrentValue } = useGoals()
  const [selected, setSelected] = useState<string[] | null>(null)
  const today = todayOf()

  const selectAgain = () => setSelected(selectGoals(goals, today).map((goal) => goal.id))
  if (status === 'loaded' && selected === null) selectAgain()

  const shown = (selected ?? []).flatMap((id) => goals.filter((goal) => goal.id === id))
  const seeAll = (
    <a className="goals-card__all" href={goalsPath} onClick={followLink}>
      {t('home.goals.seeAll')}
    </a>
  )

  return (
    <HomeCard title={t('header.nav.goals')} href={goalsPath} status={status} onRetry={reload} action={shown.length > 0 && seeAll}>
      {goals.length === 0 && (
        <HomeCardMessage title={t('home.goals.empty.title')} text={t('home.goals.empty.text')}>
          <HomeCardLink href={goalsPath}>
            <Icon name="add" size={14} />
            {t('goals.new')}
          </HomeCardLink>
        </HomeCardMessage>
      )}
      {goals.length > 0 && shown.length === 0 && (
        <HomeCardMessage title={t('home.goals.none.title')} text={t('home.goals.none.text')}>
          {seeAll}
        </HomeCardMessage>
      )}
      {shown.length > 0 && (
        <ul className="goals-card__list">
          {shown.map((goal) => {
            const achieved = goalStatusOn(goal, today) === 'achieved'
            return (
              <li key={goal.id} className="goals-card__goal" data-status={achieved ? 'achieved' : 'inProgress'}>
                <div className="goals-card__line">
                  <a className="goals-card__name" href={goalsPath} title={goal.name} onClick={followLink}>
                    {goal.name}
                  </a>
                  {achieved && <span className="goals-card__achieved">{t('goals.status.achieved')}</span>}
                  <GoalNumbers goal={goal} onChangeValue={(value) => changeCurrentValue(goal.id, value)} />
                </div>
                <div className="goal-card__bar" aria-hidden="true">
                  <div className="goal-card__fill" style={{ width: `${barFill(goal)}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </HomeCard>
  )
}
