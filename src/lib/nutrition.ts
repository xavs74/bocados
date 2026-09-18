import type { Profile } from './energy'

export const MACROS = ['carbs', 'protein', 'fat'] as const
export type MacroKey = (typeof MACROS)[number]

export const KCAL_PER_GRAM: Record<MacroKey, number> = { carbs: 4, protein: 4, fat: 9 }

export const MACRO_LABEL: Record<MacroKey, string> = {
  carbs: 'Carbohidratos',
  protein: 'Proteínas',
  fat: 'Grasas',
}

export const MACRO_SHORT: Record<MacroKey, string> = {
  carbs: 'Carb',
  protein: 'Prot',
  fat: 'Grasa',
}

/** Energy and macros. For foods these are per 100 g; for entries, the eaten amount. */
export interface Nutrients {
  kcal: number
  carbs: number
  protein: number
  fat: number
}

export interface Goals {
  kcal: number
  /** Share of calories per macro, in percent. Sums to 100. */
  split: Record<MacroKey, number>
  /** 'calculated' derives kcal from the profile; missing means the kcal were typed in. */
  mode?: 'manual' | 'calculated'
  profile?: Partial<Profile>
  /** True once the person has chosen their goal (not the starting default). */
  set?: boolean
  /** When set, protein follows body weight (g/kg) and the split is derived from it. */
  proteinPerKg?: number
  /** The person set g/kg themselves, so changing the goal leaves it alone. */
  proteinCustom?: boolean
}

export const ZERO: Nutrients = { kcal: 0, carbs: 0, protein: 0, fat: 0 }

export function scale(per100: Nutrients, grams: number): Nutrients {
  const f = grams / 100
  return {
    kcal: per100.kcal * f,
    carbs: per100.carbs * f,
    protein: per100.protein * f,
    fat: per100.fat * f,
  }
}

export function sum(items: Nutrients[]): Nutrients {
  return items.reduce(
    (acc, n) => ({
      kcal: acc.kcal + n.kcal,
      carbs: acc.carbs + n.carbs,
      protein: acc.protein + n.protein,
      fat: acc.fat + n.fat,
    }),
    ZERO,
  )
}

/** Calories contributed by each macro (4/4/9 kcal per gram). */
export function macroKcal(n: Nutrients): Record<MacroKey, number> {
  return {
    carbs: n.carbs * KCAL_PER_GRAM.carbs,
    protein: n.protein * KCAL_PER_GRAM.protein,
    fat: n.fat * KCAL_PER_GRAM.fat,
  }
}

/**
 * Share of calories from each macro, in percent. Uses the calories the macros
 * provide rather than label kcal, so the three always add up to 100.
 */
export function calorieSplit(n: Nutrients): Record<MacroKey, number> {
  const k = macroKcal(n)
  const total = k.carbs + k.protein + k.fat
  if (total <= 0) return { carbs: 0, protein: 0, fat: 0 }
  return {
    carbs: (k.carbs / total) * 100,
    protein: (k.protein / total) * 100,
    fat: (k.fat / total) * 100,
  }
}

/** Grams of each macro needed to hit the calorie goal with the chosen split. */
export function goalGrams(goals: Goals): Record<MacroKey, number> {
  return {
    carbs: (goals.kcal * goals.split.carbs) / 100 / KCAL_PER_GRAM.carbs,
    protein: (goals.kcal * goals.split.protein) / 100 / KCAL_PER_GRAM.protein,
    fat: (goals.kcal * goals.split.fat) / 100 / KCAL_PER_GRAM.fat,
  }
}

/** Percentage points a macro may drift from its target and still count as on target. */
export const SPLIT_TOLERANCE = 5

export function onTarget(actualPct: number, targetPct: number): boolean {
  return Math.abs(actualPct - targetPct) <= SPLIT_TOLERANCE
}

/**
 * Label kcal that disagree with the macros by more than this fraction are
 * probably a typo (fibre and rounding explain small gaps).
 */
export function kcalLooksWrong(n: Nutrients): boolean {
  const k = macroKcal(n)
  const fromMacros = k.carbs + k.protein + k.fat
  if (n.kcal === 0 && fromMacros === 0) return false
  return Math.abs(fromMacros - n.kcal) > Math.max(n.kcal, fromMacros) * 0.2 + 5
}
