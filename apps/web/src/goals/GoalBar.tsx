import { barFill, type Goal } from './goals'

/** How far a Goal has got, as a bar that stops at full; its colour comes from the Goal Status around it. */
export function GoalBar({ goal }: { goal: Goal }) {
  return (
    <div className="goal-card__bar" aria-hidden="true">
      <div className="goal-card__fill" style={{ width: `${barFill(goal)}%` }} />
    </div>
  )
}
