import { describe, expect, it } from 'vitest'
import type { Entry } from '../db'
import { describeItems, entriesFromItems, itemsFromEntries, totalsOf } from './mealSets'

const entry = (name: string, grams: number, createdAt: number): Entry => ({
  id: String(createdAt),
  date: '2026-09-10',
  meal: 'breakfast',
  foodId: 'f1',
  name,
  per100: { kcal: 370, carbs: 56, protein: 17, fat: 7 },
  grams,
  amount: { quantity: grams },
  createdAt,
})

const entries = [entry('Copos de avena', 50, 2), entry('Leche semidesnatada', 250, 1)]

describe('itemsFromEntries', () => {
  it('keeps the values but drops the day and id', () => {
    const items = itemsFromEntries(entries)
    expect(items[0]).toEqual({ foodId: 'f1', name: 'Copos de avena', per100: entries[0].per100, grams: 50, amount: { quantity: 50 } })
    expect(items[0]).not.toHaveProperty('date')
    expect(items[0]).not.toHaveProperty('id')
  })
})

describe('entriesFromItems', () => {
  it('logs them on the given day and meal, keeping their order', () => {
    const rows = entriesFromItems(itemsFromEntries(entries), '2026-09-17', 'dinner', 1000)
    expect(rows.map((r) => [r.date, r.meal, r.name, r.createdAt])).toEqual([
      ['2026-09-17', 'dinner', 'Copos de avena', 1000],
      ['2026-09-17', 'dinner', 'Leche semidesnatada', 1001],
    ])
  })
})

describe('totalsOf and describeItems', () => {
  it('adds the items up and lists their names', () => {
    const items = itemsFromEntries(entries)
    expect(totalsOf(items).kcal).toBeCloseTo(370 * 3)
    expect(describeItems(items)).toBe('Copos de avena, Leche semidesnatada')
  })
})
