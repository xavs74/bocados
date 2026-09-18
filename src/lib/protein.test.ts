import { describe, expect, it } from 'vitest'
import { defaultProteinPerKg, referenceWeight, splitFromProtein } from './protein'

describe('defaultProteinPerKg', () => {
  it('asks for more protein in a deficit', () => {
    expect(defaultProteinPerKg(-500)).toBe(2.0)
    expect(defaultProteinPerKg(0)).toBe(1.6)
    expect(defaultProteinPerKg(250)).toBe(1.8)
  })
})

describe('referenceWeight', () => {
  it('uses actual weight up to a BMI of 30', () => {
    expect(referenceWeight({ weightKg: 80, heightCm: 180 })).toEqual({ kg: 80, adjusted: false })
  })

  it('uses the weight at a BMI of 25 above that', () => {
    // 130 kg at 175 cm is a BMI of 42; BMI 25 at 175 cm is about 77 kg.
    expect(referenceWeight({ weightKg: 130, heightCm: 175 })).toEqual({ kg: 77, adjusted: true })
  })
})

describe('splitFromProtein', () => {
  it('turns grams per kilo into a split that adds up to 100', () => {
    // 80 kg × 2 g = 160 g = 640 kcal, 29 % of 2200.
    const { split, proteinGrams } = splitFromProtein(2200, 80, 2)
    expect(split).toEqual({ carbs: 41, protein: 29, fat: 30 })
    expect(proteinGrams).toBe(160)
  })

  it('lets fat give way before carbs drop too low', () => {
    // 100 kg × 2.4 g on 1600 kcal would be 60 % protein.
    const { split } = splitFromProtein(1600, 100, 2.4)
    expect(split.carbs).toBeGreaterThanOrEqual(15)
    expect(split.fat).toBeGreaterThanOrEqual(20)
    expect(split.carbs + split.protein + split.fat).toBe(100)
  })
})
