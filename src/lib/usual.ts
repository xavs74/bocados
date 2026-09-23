import type { Amount, Entry, Food, Id, Meal } from '../db'
import { addDays } from './dates'

/** How far back "lo de siempre" looks. */
export const USUAL_DAYS = 28
/** A food counts as usual for a meal once it has been eaten there on this many days. */
const MIN_DAYS = 2
const MAX_ITEMS = 6

export interface UsualFood {
  food: Food
  /** The amount used the last time it was eaten in this meal. */
  amount: Amount
  /** Days in the window it was eaten in this meal. */
  days: number
}

/** First day of the window that ends the day before `date`. */
export const usualFrom = (date: string) => addDays(date, -USUAL_DAYS)

/**
 * What someone usually eats in a meal: foods eaten there on at least two of
 * the last four weeks' days, most frequent first, each with the amount used
 * last time. Foods already in the meal on `date` are left out, and so are
 * foods that have since been deleted.
 */
export function usualFoods(entries: Entry[], meal: Meal, date: string, foods: Map<Id, Food>): UsualFood[] {
  const from = usualFrom(date)
  const byFood = new Map<Id, { days: Set<string>; last: Entry }>()
  const already = new Set<Id>()

  for (const e of entries) {
    if (e.meal !== meal) continue
    if (e.date === date) {
      already.add(e.foodId)
      continue
    }
    if (e.date < from || e.date > date) continue
    const seen = byFood.get(e.foodId)
    if (!seen) {
      byFood.set(e.foodId, { days: new Set([e.date]), last: e })
      continue
    }
    seen.days.add(e.date)
    if (e.date > seen.last.date || (e.date === seen.last.date && e.createdAt > seen.last.createdAt)) seen.last = e
  }

  const usual: (UsualFood & { lastDate: string })[] = []
  for (const [foodId, { days, last }] of byFood) {
    const food = foods.get(foodId)
    if (!food || already.has(foodId) || days.size < MIN_DAYS) continue
    usual.push({ food, amount: last.amount, days: days.size, lastDate: last.date })
  }
  usual.sort((a, b) => b.days - a.days || b.lastDate.localeCompare(a.lastDate) || a.food.name.localeCompare(b.food.name))
  return usual.slice(0, MAX_ITEMS).map(({ food, amount, days }) => ({ food, amount, days }))
}
