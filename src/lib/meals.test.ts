import { describe, expect, it } from 'vitest'
import { mealForNow, normalizeMeals, visibleMeals } from './meals'

const at = (h: number) => new Date(2026, 8, 18, h, 0)

describe('normalizeMeals', () => {
  it('orders meals through the day and drops unknown ones', () => {
    expect(normalizeMeals(['dinner', 'breakfast', 'brunch'])).toEqual(['breakfast', 'dinner'])
  })

  it('falls back to the default four when nothing valid is left', () => {
    expect(normalizeMeals([])).toEqual(['breakfast', 'lunch', 'snack', 'dinner'])
    expect(normalizeMeals(undefined)).toHaveLength(4)
  })
})

describe('mealForNow', () => {
  it('picks the latest enabled meal that has started', () => {
    expect(mealForNow(['breakfast', 'lunch', 'snack', 'dinner'], at(18))).toBe('snack')
    // Without merienda, the afternoon still belongs to lunch.
    expect(mealForNow(['breakfast', 'lunch', 'dinner'], at(18))).toBe('lunch')
    expect(mealForNow(['breakfast', 'midmorning', 'lunch', 'dinner'], at(11))).toBe('midmorning')
  })

  it('uses the first meal before any has started', () => {
    expect(mealForNow(['breakfast', 'lunch'], at(4))).toBe('breakfast')
  })
})

describe('visibleMeals', () => {
  it('keeps a switched-off meal on screen while it holds food', () => {
    expect(visibleMeals(['breakfast', 'lunch', 'dinner'], ['snack'])).toEqual(['breakfast', 'lunch', 'snack', 'dinner'])
  })
})
