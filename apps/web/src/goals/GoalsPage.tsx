import { useState } from 'react'
import { todayOf } from '../calendar/calendar'
import { AppHeader } from '../header/AppHeader'
import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { CreateGoalDialog } from './CreateGoalDialog'
import { GoalCard } from './GoalCard'
import { orderGoals } from './goals'
import { useGoals } from './useGoals'
import './GoalsPage.css'

/**
 * Goals ("Objetivos"): the Account's Goals as cards, and "Nuevo objetivo" to
 * add one. With no Goals at all, a short phrase takes the list's place and
 * the button goes with it.
 */
export function GoalsPage() {
  const { t } = useI18n()
  const { goals, status, add } = useGoals()
  const [creating, setCreating] = useState(false)
  const empty = status === 'loaded' && goals.length === 0
  const today = todayOf()

  const newGoal = (size: 'compact' | 'standard') => (
    <Button size={size} onClick={() => setCreating(true)}>
      <Icon name="add" size={14} />
      {t('goals.new')}
    </Button>
  )

  return (
    <div className="goals-page">
      <AppHeader current="goals" />
      <main className="goals-page__main" aria-busy={status === 'loading' || undefined}>
        <div className="goals-page__head">
          <h1 className="goals-page__title ro-serif">{t('goals.title')}</h1>
          {status !== 'loading' && !empty && newGoal('compact')}
        </div>
        {status === 'failed' && (
          <p role="alert" className="goals-page__failure">
            {t('goals.loadFailed')}
          </p>
        )}
        {empty && (
          <div className="goals-page__empty">
            <p className="goals-page__empty-text">{t('goals.empty')}</p>
            {newGoal('standard')}
          </div>
        )}
        {goals.length > 0 && (
          <div className="goals-page__list">
            {orderGoals(goals, today).map((goal) => (
              <GoalCard key={goal.id} goal={goal} today={today} />
            ))}
          </div>
        )}
      </main>
      {creating && (
        <CreateGoalDialog
          onClose={() => setCreating(false)}
          onCreated={(goal) => {
            add(goal)
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}
