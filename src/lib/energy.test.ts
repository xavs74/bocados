import { describe, expect, it } from 'vitest'
import { bmr, isComplete, targetKcal, tdee, type Profile } from './energy'
import { moveDivider, rebalance } from './split'

const man: Profile = { sex: 'male', age: 30, heightCm: 180, weightKg: 80, activity: 'moderate', formula: 'mifflin', adjustment: 0 }

describe('bmr', () => {
  it('uses Mifflin-St Jeor', () => {
    expect(bmr(man)).toBeCloseTo(1780)
    expect(bmr({ ...man, sex: 'female' })).toBeCloseTo(1614)
  })

  it('uses the revised Harris-Benedict', () => {
    expect(bmr({ ...man, formula: 'harris' })).toBeCloseTo(1853.63, 1)
    expect(bmr({ ...man, sex: 'female', formula: 'harris' })).toBeCloseTo(1615.09, 1)
  })
})

describe('tdee and target', () => {
  it('multiplies by activity and applies the adjustment', () => {
    expect(tdee(man)).toBeCloseTo(2759)
    expect(targetKcal({ ...man, adjustment: -500 })).toBe(2259)
  })

  it('needs every field before calculating', () => {
    expect(isComplete(man)).toBe(true)
    expect(isComplete({ ...man, age: undefined })).toBe(false)
    expect(isComplete({ ...man, heightCm: 18 })).toBe(false)
  })
})

describe('rebalance', () => {
  it('keeps the total at 100 and the ratio of the others', () => {
    const s = rebalance({ carbs: 40, protein: 30, fat: 30 }, 'carbs', 60)
    expect(s).toEqual({ carbs: 60, protein: 20, fat: 20 })
  })

  it('never lets a macro drop below the minimum', () => {
    const s = rebalance({ carbs: 40, protein: 55, fat: 5 }, 'protein', 90)
    expect(s.carbs + s.protein + s.fat).toBe(100)
    expect(Math.min(s.carbs, s.fat)).toBeGreaterThanOrEqual(5)
  })
})

describe('moveDivider', () => {
  it('only changes the two neighbouring macros', () => {
    expect(moveDivider({ carbs: 40, protein: 30, fat: 30 }, 0, 50)).toEqual({ carbs: 50, protein: 20, fat: 30 })
    expect(moveDivider({ carbs: 40, protein: 30, fat: 30 }, 1, 60)).toEqual({ carbs: 40, protein: 20, fat: 40 })
  })

  it('stops before squeezing a macro out', () => {
    expect(moveDivider({ carbs: 40, protein: 30, fat: 30 }, 0, 99)).toEqual({ carbs: 65, protein: 5, fat: 30 })
  })
})
