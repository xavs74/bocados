import { describe, expect, it } from 'vitest'
import { MEALS, type Meal, type Planned } from '../db'
import { planText } from './share'

let id = 0
const item = (meal: Meal, name: string, grams: number, kcal100: number, serving?: { label: string; grams: number }): Planned => ({
  id: String(++id),
  date: '2026-09-21',
  meal,
  foodId: String(id),
  name,
  per100: { kcal: kcal100, carbs: 0, protein: 0, fat: 0 },
  grams,
  amount: serving ? { quantity: grams / serving.grams, serving } : { quantity: grams },
  createdAt: id,
})

const empty = () => Object.fromEntries(MEALS.map((m) => [m, []])) as unknown as Record<Meal, Planned[]>

describe('planText', () => {
  it('writes each day with its meals in order and its calories', () => {
    const monday = empty()
    monday.lunch = [item('lunch', 'Arroz blanco (crudo)', 90, 350)]
    monday.breakfast = [item('breakfast', 'Leche entera', 250, 64, { label: '1 vaso', grams: 250 }), item('breakfast', 'Pan blanco', 80, 267)]
    const text = planText([{ date: '2026-09-21', meals: monday }], MEALS)
    expect(text.split('\n')).toEqual([
      '*Lunes, 21 de septiembre* · 689 kcal',
      'Desayuno:',
      '- Leche entera: 1 × vaso · 250 g',
      '- Pan blanco: 80 g',
      'Comida:',
      '- Arroz blanco (crudo): 90 g',
    ])
  })

  it('skips days with nothing planned', () => {
    const tuesday = empty()
    tuesday.dinner = [item('dinner', 'Tortilla', 150, 150)]
    const text = planText(
      [
        { date: '2026-09-21', meals: empty() },
        { date: '2026-09-22', meals: tuesday },
      ],
      MEALS,
    )
    expect(text.startsWith('*Martes, 22 de septiembre*')).toBe(true)
  })
})
