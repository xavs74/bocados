import { MEALS, db, type Entry, type Meal, type Planned } from '../db'
import { categoryOf } from './categories'
import { addDays, weekDays } from './dates'
import { itemsFromEntries, type PastMeal } from './mealSets'
import type { MealSetItem } from '../db'
import { scale, sum, type Nutrients } from './nutrition'

export type PlannedItem = Omit<Planned, 'id'>

export const plannedTotals = (items: Pick<Planned, 'per100' | 'grams'>[]): Nutrients => sum(items.map((i) => scale(i.per100, i.grams)))

export async function planItems(items: MealSetItem[], date: string, meal: Meal): Promise<void> {
  const now = Date.now()
  await db.planned.bulkAdd(items.map((item, i) => ({ ...item, date, meal, createdAt: now + i })) as Planned[])
}

/** Everything planned between two days, inclusive. */
export async function plannedBetween(from: string, to: string): Promise<Planned[]> {
  return (await db.planned.where('date').between(from, to, true, true).toArray()).sort((a, b) => a.createdAt - b.createdAt)
}

/** Turns a planned food into a logged one. */
export async function eatPlanned(planned: Planned): Promise<void> {
  await db.transaction('rw', db.entries, db.planned, async () => {
    const { id, ...rest } = planned
    await db.entries.add({ ...rest, createdAt: Date.now() } as Entry)
    await db.planned.delete(id)
  })
}

/** Logs every planned food of a meal at once. */
export async function eatPlannedMeal(items: Planned[]): Promise<void> {
  await db.transaction('rw', db.entries, db.planned, async () => {
    const now = Date.now()
    await db.entries.bulkAdd(items.map(({ id: _id, ...rest }, i) => ({ ...rest, createdAt: now + i })) as Entry[])
    await db.planned.bulkDelete(items.map((p) => p.id))
  })
}

/** Copies a day of the plan onto another day, replacing what was there. */
export async function copyPlannedDay(from: string, to: string): Promise<number> {
  return db.transaction('rw', db.planned, async () => {
    const source = await db.planned.where('date').equals(from).sortBy('createdAt')
    await db.planned.where('date').equals(to).delete()
    const now = Date.now()
    await db.planned.bulkAdd(source.map(({ id: _id, ...rest }, i) => ({ ...rest, date: to, createdAt: now + i })) as Planned[])
    return source.length
  })
}

/** Copies a whole week of the plan onto another week, replacing it. */
export async function copyPlannedWeek(fromStart: string, toStart: string): Promise<number> {
  let copied = 0
  for (let i = 0; i < 7; i++) copied += await copyPlannedDay(addDays(fromStart, i), addDays(toStart, i))
  return copied
}

/** Plans what was actually eaten on a day: useful to repeat a good week. */
export async function planFromEaten(from: string, to: string): Promise<number> {
  const entries = await db.entries.where('date').equals(from).sortBy('createdAt')
  for (const meal of MEALS) {
    const items = itemsFromEntries(entries.filter((e) => e.meal === meal))
    if (items.length) await planItems(items, to, meal)
  }
  return entries.length
}

export async function clearPlannedWeek(startIso: string): Promise<void> {
  await db.planned.where('date').between(startIso, addDays(startIso, 6), true, true).delete()
}

/** Planned and eaten side by side for one day. */
export interface DayComparison {
  planned: Nutrients
  eaten: Nutrients
  /** Planned foods still to eat. */
  pending: number
}

export function compareDay(planned: Planned[], entries: Entry[]): DayComparison {
  return {
    planned: plannedTotals(planned),
    eaten: sum(entries.map((e) => scale(e.per100, e.grams))),
    pending: planned.length,
  }
}

export interface ShoppingLine {
  name: string
  category: string
  grams: number
  /** How many servings, when every planned amount used the same one. */
  servings?: { label: string; count: number }
}

/**
 * One line per food for a stretch of the plan, with the grams added up. Days
 * already eaten aren't in the plan any more, so the list only covers what's
 * still to buy.
 */
export function shoppingList(planned: Planned[], categoryFor: (foodId: number) => string): ShoppingLine[] {
  const lines = new Map<string, ShoppingLine & { labels: Set<string>; count: number }>()
  for (const p of planned) {
    const key = p.name.toLowerCase()
    const line = lines.get(key) ?? {
      name: p.name,
      category: categoryFor(p.foodId),
      grams: 0,
      labels: new Set<string>(),
      count: 0,
    }
    line.grams += p.grams
    if (p.amount.serving) {
      line.labels.add(p.amount.serving.label)
      line.count += p.amount.quantity
    } else {
      line.labels.add('g')
    }
    lines.set(key, line)
  }
  return [...lines.values()]
    .map(({ labels, count, ...line }) => {
      const only = labels.size === 1 ? [...labels][0] : null
      return only && only !== 'g' ? { ...line, servings: { label: only, count: Math.round(count * 10) / 10 } } : line
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
}

/** Looks up each planned food's category from the food list. */
export function categoryLookup(foods: { id: number; category?: string }[]): (foodId: number) => string {
  const byId = new Map(foods.map((f) => [f.id, categoryOf(f)]))
  return (foodId) => byId.get(foodId) ?? 'Otros'
}

/** The plan for a week, grouped by day and meal. */
export function groupWeek(startIso: string, planned: Planned[]): { date: string; meals: Record<Meal, Planned[]> }[] {
  return weekDays(startIso).map((date) => ({
    date,
    meals: Object.fromEntries(MEALS.map((meal) => [meal, planned.filter((p) => p.date === date && p.meal === meal)])) as Record<Meal, Planned[]>,
  }))
}

export type { PastMeal }
