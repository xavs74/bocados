export type Sex = 'male' | 'female'
export type Formula = 'mifflin' | 'harris'

export const ACTIVITY = [
  { id: 'sedentary', factor: 1.2, label: 'Sedentaria', hint: 'Poco o nada de ejercicio' },
  { id: 'light', factor: 1.375, label: 'Ligera', hint: 'Ejercicio 1–3 días por semana' },
  { id: 'moderate', factor: 1.55, label: 'Moderada', hint: 'Ejercicio 3–5 días por semana' },
  { id: 'high', factor: 1.725, label: 'Alta', hint: 'Ejercicio 6–7 días por semana' },
  { id: 'very-high', factor: 1.9, label: 'Muy alta', hint: 'Trabajo físico o entrenas dos veces al día' },
] as const

export type ActivityId = (typeof ACTIVITY)[number]['id']

/** Daily kcal added to maintenance. 500 kcal a day is roughly 0.5 kg a week. */
export const ADJUSTMENTS = [
  { kcal: -500, label: 'Perder peso', hint: '≈ 0,5 kg menos por semana' },
  { kcal: -250, label: 'Perder poco a poco', hint: '≈ 0,25 kg menos por semana' },
  { kcal: 0, label: 'Mantener', hint: 'Comer lo que gastas' },
  { kcal: 250, label: 'Ganar poco a poco', hint: '≈ 0,25 kg más por semana' },
  { kcal: 500, label: 'Ganar peso', hint: '≈ 0,5 kg más por semana' },
] as const

export const FORMULAS: { id: Formula; label: string }[] = [
  { id: 'mifflin', label: 'Mifflin-St Jeor (recomendada)' },
  { id: 'harris', label: 'Harris-Benedict revisada' },
]

export interface Profile {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  activity: ActivityId
  formula: Formula
  /** kcal per day added to maintenance; negative for a deficit. */
  adjustment: number
}

export function isComplete(p: Partial<Profile> | undefined): p is Profile {
  return (
    !!p &&
    (p.sex === 'male' || p.sex === 'female') &&
    inRange(p.age, 10, 120) &&
    inRange(p.heightCm, 100, 250) &&
    inRange(p.weightKg, 25, 350) &&
    ACTIVITY.some((a) => a.id === p.activity) &&
    (p.formula === 'mifflin' || p.formula === 'harris') &&
    typeof p.adjustment === 'number'
  )
}

function inRange(n: number | undefined, min: number, max: number) {
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
}

/** Basal metabolic rate: kcal burned per day at complete rest. */
export function bmr(p: Profile): number {
  const { sex, age, heightCm: h, weightKg: w } = p
  if (p.formula === 'harris') {
    // Roza & Shizgal (1984) revision of Harris-Benedict.
    return sex === 'male'
      ? 88.362 + 13.397 * w + 4.799 * h - 5.677 * age
      : 447.593 + 9.247 * w + 3.098 * h - 4.33 * age
  }
  return 10 * w + 6.25 * h - 5 * age + (sex === 'male' ? 5 : -161)
}

export function activityFactor(p: Profile): number {
  return ACTIVITY.find((a) => a.id === p.activity)!.factor
}

/** Total daily energy expenditure: basal rate times activity. */
export function tdee(p: Profile): number {
  return bmr(p) * activityFactor(p)
}

export function targetKcal(p: Profile): number {
  return Math.round(tdee(p) + p.adjustment)
}
