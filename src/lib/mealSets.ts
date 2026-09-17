import { MEALS, db, type Entry, type Meal, type MealSet, type MealSetItem } from '../db'
import { scale, sum, type Nutrients } from './nutrition'

/** Strips the day from logged foods so they can be logged again elsewhere. */
export function itemsFromEntries(entries: Entry[]): MealSetItem[] {
  return entries.map(({ foodId, name, per100, grams, amount }) => ({ foodId, name, per100, grams, amount }))
}

/** Builds the rows to log for a day and meal, spaced so they keep their order. */
export function entriesFromItems(items: MealSetItem[], date: string, meal: Meal, now = Date.now()): Omit<Entry, 'id'>[] {
  return items.map((item, i) => ({ ...item, date, meal, createdAt: now + i }))
}

export function totalsOf(items: MealSetItem[]): Nutrients {
  return sum(items.map((i) => scale(i.per100, i.grams)))
}

export const describeItems = (items: MealSetItem[]) => items.map((i) => i.name).join(', ')

/** A past day whose meal can be repeated. */
export interface PastMeal {
  date: string
  meal: Meal
  items: MealSetItem[]
}

/** The last days that have something logged for `meal`, most recent first. */
export async function recentMeals(meal: Meal, before: string, days = 30, limit = 8): Promise<PastMeal[]> {
  const from = new Date(new Date(before).getTime() - days * 86400000).toISOString().slice(0, 10)
  const entries = await db.entries.where('date').between(from, before, true, false).toArray()
  const byDate = new Map<string, Entry[]>()
  for (const e of entries) {
    if (e.meal !== meal) continue
    if (!byDate.has(e.date)) byDate.set(e.date, [])
    byDate.get(e.date)!.push(e)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, limit)
    .map(([date, list]) => ({ date, meal, items: itemsFromEntries(list.sort((a, b) => a.createdAt - b.createdAt)) }))
}

/** The last days that have anything logged at all, most recent first. */
export async function recentDays(before: string, days = 30, limit = 8): Promise<{ date: string; entries: Entry[] }[]> {
  const from = new Date(new Date(before).getTime() - days * 86400000).toISOString().slice(0, 10)
  const entries = await db.entries.where('date').between(from, before, true, false).toArray()
  const byDate = new Map<string, Entry[]>()
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, [])
    byDate.get(e.date)!.push(e)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, limit)
    .map(([date, list]) => ({ date, entries: list.sort((a, b) => a.createdAt - b.createdAt) }))
}

export async function logItems(items: MealSetItem[], date: string, meal: Meal): Promise<void> {
  await db.entries.bulkAdd(entriesFromItems(items, date, meal) as Entry[])
}

/** Copies every meal of one day onto another. */
export async function copyDay(from: string, to: string): Promise<number> {
  const entries = await db.entries.where('date').equals(from).sortBy('createdAt')
  const now = Date.now()
  const copies = MEALS.flatMap((meal) =>
    entriesFromItems(
      itemsFromEntries(entries.filter((e) => e.meal === meal)),
      to,
      meal,
      now + MEALS.indexOf(meal) * 100,
    ),
  )
  await db.entries.bulkAdd(copies as Entry[])
  return copies.length
}

export async function saveMealSet(name: string, items: MealSetItem[]): Promise<number> {
  return db.mealSets.add({ name: name.trim(), items, createdAt: Date.now() } as MealSet)
}

/** Logs every food of a saved meal and remembers it was used. */
export async function logMealSet(set: MealSet, date: string, meal: Meal): Promise<void> {
  await db.transaction('rw', db.entries, db.mealSets, async () => {
    await logItems(set.items, date, meal)
    await db.mealSets.update(set.id, { lastUsed: Date.now() })
  })
}
