import { describe, expect, it } from 'vitest'
import type { Planned } from '../db'
import { startOfWeek, weekDays, weekLabel } from './dates'
import { categoryLookup, compareDay, expandRecipes, groupWeek, plannedTotals, shoppingList } from './plan'

const planned = (name: string, grams: number, date = '2026-09-14', meal: Planned['meal'] = 'lunch', foodId = 'f1', serving?: { label: string; grams: number }): Planned => ({
  id: String(Math.random()),
  date,
  meal,
  foodId,
  name,
  per100: { kcal: 100, carbs: 10, protein: 5, fat: 2 },
  grams,
  amount: serving ? { quantity: grams / serving.grams, serving } : { quantity: grams },
  createdAt: 1,
})

describe('week helpers', () => {
  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-09-17')).toBe('2026-09-14') // Thursday -> Monday
    expect(startOfWeek('2026-09-14')).toBe('2026-09-14')
    expect(startOfWeek('2026-09-20')).toBe('2026-09-14') // Sunday belongs to the week before
  })

  it('lists the seven days and labels the week', () => {
    expect(weekDays('2026-09-14')).toHaveLength(7)
    expect(weekDays('2026-09-14').at(-1)).toBe('2026-09-20')
    expect(weekLabel('2026-09-14')).toBe('14 – 20 de septiembre')
    expect(weekLabel('2026-09-28')).toContain('octubre')
  })
})

describe('plannedTotals and compareDay', () => {
  it('adds up the plan and compares it with what was eaten', () => {
    const p = [planned('Arroz', 200), planned('Pollo', 150)]
    expect(plannedTotals(p).kcal).toBeCloseTo(350)
    const c = compareDay(p, [])
    expect(c.eaten.kcal).toBe(0)
    expect(c.pending).toBe(2)
  })
})

describe('groupWeek', () => {
  it('puts every planned food in its day and meal', () => {
    const week = groupWeek('2026-09-14', [planned('Arroz', 200), planned('Tostada', 60, '2026-09-15', 'breakfast')])
    expect(week).toHaveLength(7)
    expect(week[0].meals.lunch.map((p) => p.name)).toEqual(['Arroz'])
    expect(week[1].meals.breakfast.map((p) => p.name)).toEqual(['Tostada'])
    expect(week[2].meals.dinner).toEqual([])
  })
})

describe('shoppingList', () => {
  const category = categoryLookup([
    { id: 'f1', category: 'Cereales, pan y pasta' },
    { id: 'f2', category: 'Carnes' },
  ])

  it('adds up the grams of the same food across the week', () => {
    const list = shoppingList([planned('Arroz', 200), planned('Arroz', 150, '2026-09-16'), planned('Pollo', 300, '2026-09-15', 'lunch', 'f2')], category)
    expect(list.map((l) => [l.name, l.grams])).toEqual([
      ['Pollo', 300],
      ['Arroz', 350],
    ])
  })

  it('counts servings when every amount used the same one', () => {
    const serving = { label: '1 unidad', grams: 60 }
    const list = shoppingList([planned('Huevo', 120, '2026-09-14', 'breakfast', 'f1', serving), planned('Huevo', 60, '2026-09-15', 'breakfast', 'f1', serving)], category)
    expect(list[0].servings).toEqual({ label: '1 unidad', count: 3 })
  })

  it('leaves servings out when the amounts are mixed', () => {
    const list = shoppingList([planned('Huevo', 120, '2026-09-14', 'breakfast', 'f1', { label: '1 unidad', grams: 60 }), planned('Huevo', 55)], category)
    expect(list[0].servings).toBeUndefined()
    expect(list[0].grams).toBe(175)
  })
})

describe('expandRecipes', () => {
  const recipe = {
    id: 'r1',
    name: 'Arroz con pollo',
    servings: 4,
    foodId: 'f9',
    createdAt: 0,
    ingredients: [
      { foodId: 'f1', name: 'Arroz', per100: { kcal: 350, carbs: 78, protein: 7, fat: 1 }, grams: 400, amount: { quantity: 400 } },
      { foodId: 'f2', name: 'Pollo', per100: { kcal: 113, carbs: 0, protein: 22, fat: 3 }, grams: 600, amount: { quantity: 600 } },
    ],
  }
  const recipeFor = (id: string) => (id === 'f9' ? recipe : undefined)

  it('turns a planned recipe into its ingredients, scaled to the amount', () => {
    const out = expandRecipes([planned('Arroz con pollo', 250, '2026-09-14', 'lunch', 'f9')], recipeFor)
    expect(out.map((p) => [p.name, p.grams])).toEqual([
      ['Arroz', 100],
      ['Pollo', 150],
    ])
  })

  it('adds recipe ingredients to the same foods planned on their own', () => {
    const list = shoppingList(expandRecipes([planned('Arroz con pollo', 250, '2026-09-14', 'lunch', 'f9'), planned('Arroz', 80, '2026-09-15', 'lunch', 'f1')], recipeFor), categoryLookup([]))
    expect(list.find((l) => l.name === 'Arroz')?.grams).toBe(180)
    expect(list.some((l) => l.name === 'Arroz con pollo')).toBe(false)
  })
})
