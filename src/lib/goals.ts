import { DEFAULT_GOALS } from '../db'
import { isComplete, tdee } from './energy'
import type { Goals } from './nutrition'

/**
 * Whether these goals are the person's own. Installs from before the flag
 * existed count as set if the goal was changed from the untouched default,
 * so only phones still on 1,700 kcal see the first-run setup.
 */
export function goalsAreSet(goals: Goals | undefined): boolean {
  if (!goals) return false
  if (goals.set !== undefined) return goals.set
  const d = DEFAULT_GOALS
  return (
    goals.mode === 'calculated' ||
    goals.kcal !== d.kcal ||
    goals.split.carbs !== d.split.carbs ||
    goals.split.protein !== d.split.protein ||
    goals.split.fat !== d.split.fat
  )
}

/**
 * What this person burns in a day: measured from their own weeks when that has
 * been worked out, otherwise the formula's estimate. Null without a profile.
 */
export function burnOf(goals: Goals): number | null {
  if (goals.measuredTdee) return goals.measuredTdee
  return goals.mode === 'calculated' && isComplete(goals.profile) ? Math.round(tdee(goals.profile)) : null
}
