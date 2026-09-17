import { describe, expect, it } from 'vitest'
import { calorieSplit, goalGrams, kcalLooksWrong, onTarget, scale, sum } from './nutrition'

const oats = { kcal: 370, carbs: 58, protein: 13, fat: 7.2 }

describe('scale', () => {
  it('matches the spreadsheet row for 55 g of oats', () => {
    const n = scale(oats, 55)
    expect(n.kcal).toBeCloseTo(203.5)
    expect(n.carbs).toBeCloseTo(31.9)
    expect(n.protein).toBeCloseTo(7.15)
    expect(n.fat).toBeCloseTo(3.96)
  })
})

describe('calorieSplit', () => {
  it('weights fat at 9 kcal per gram (Sunday from the sheet)', () => {
    const split = calorieSplit({ kcal: 1299.7, carbs: 123.8, protein: 114.2, fat: 37.3 })
    expect(split.carbs).toBeCloseTo(38.5, 1)
    expect(split.protein).toBeCloseTo(35.5, 1)
    expect(split.fat).toBeCloseTo(26.1, 1)
  })

  it('is all zeros for an empty day', () => {
    expect(calorieSplit(sum([]))).toEqual({ carbs: 0, protein: 0, fat: 0 })
  })
})

describe('goalGrams', () => {
  it('converts a calorie split into grams', () => {
    const g = goalGrams({ kcal: 2000, split: { carbs: 40, protein: 30, fat: 30 } })
    expect(g.carbs).toBeCloseTo(200)
    expect(g.protein).toBeCloseTo(150)
    expect(g.fat).toBeCloseTo(66.67, 1)
  })
})

describe('onTarget', () => {
  it('allows five percentage points either side', () => {
    expect(onTarget(30, 25)).toBe(true)
    expect(onTarget(31, 25)).toBe(false)
  })
})

describe('kcalLooksWrong', () => {
  it('accepts real labels and flags obvious typos', () => {
    expect(kcalLooksWrong(oats)).toBe(false)
    expect(kcalLooksWrong({ ...oats, kcal: 37 })).toBe(true)
  })
})
