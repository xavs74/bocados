import type { Profile } from './energy'
import type { Split } from './split'

export const MIN_PER_KG = 1.2
export const MAX_PER_KG = 2.4

/** Usual targets: more protein in a deficit helps keep muscle. */
export function defaultProteinPerKg(adjustment: number): number {
  if (adjustment < 0) return 2.0
  if (adjustment > 0) return 1.8
  return 1.6
}

export const bmi = (p: Pick<Profile, 'weightKg' | 'heightCm'>) => p.weightKg / (p.heightCm / 100) ** 2

/**
 * Weight to multiply grams per kilo by. Above a BMI of 30, actual weight gives
 * unrealistic protein, so the weight at a BMI of 25 is used instead.
 */
export function referenceWeight(p: Pick<Profile, 'weightKg' | 'heightCm'>): { kg: number; adjusted: boolean } {
  if (bmi(p) <= 30) return { kg: p.weightKg, adjusted: false }
  return { kg: Math.round(25 * (p.heightCm / 100) ** 2), adjusted: true }
}

/** Fat share while protein is set by weight; carbs take what's left. */
export const FAT_PCT = 30
const MIN_FAT_PCT = 20
const MIN_CARBS_PCT = 15

/**
 * Macro split for a calorie goal when protein is set in grams per kilo. If
 * protein would squeeze carbs below 15 %, fat gives way first (down to 20 %),
 * then protein is capped.
 */
export function splitFromProtein(kcal: number, weightKg: number, perKg: number): { split: Split; proteinGrams: number } {
  let protein = Math.round(((weightKg * perKg * 4) / kcal) * 100)
  let fat = FAT_PCT
  if (100 - protein - fat < MIN_CARBS_PCT) fat = Math.max(MIN_FAT_PCT, 100 - protein - MIN_CARBS_PCT)
  if (100 - protein - fat < MIN_CARBS_PCT) protein = 100 - fat - MIN_CARBS_PCT
  const carbs = 100 - protein - fat
  return { split: { carbs, protein, fat }, proteinGrams: Math.round((kcal * protein) / 100 / 4) }
}
