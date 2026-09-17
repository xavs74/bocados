import { MEALS, MEAL_LABEL, type Food, type Meal } from '../db'
import { weekdayName } from './dates'
import { goalGrams, type Goals } from './nutrition'

/** Day names as the answer may write them, in week order (Monday first). */
const DAY_NAMES = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']

const MEAL_NAMES: Record<string, Meal> = {
  desayuno: 'breakfast',
  almuerzo: 'lunch',
  comida: 'lunch',
  merienda: 'snack',
  snack: 'snack',
  cena: 'dinner',
}

export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/**
 * The prompt someone pastes into ChatGPT or Claude. It asks for the plan in a
 * fixed shape, so reading the answer back needs no guessing, and tells the
 * model not to bother with calories: Bocados works those out from its own food
 * data.
 */
export function buildPrompt(goals: Goals, options: { days: number; notes?: string }): string {
  const g = goalGrams(goals)
  const meals = MEALS.map((m) => MEAL_LABEL[m].toLowerCase()).join(', ')
  return [
    `Hazme un plan de comidas de ${options.days} días adaptado a estos objetivos diarios:`,
    `- ${Math.round(goals.kcal)} kcal`,
    `- ${Math.round(g.carbs)} g de carbohidratos, ${Math.round(g.protein)} g de proteínas, ${Math.round(g.fat)} g de grasas`,
    options.notes?.trim() ? `- Ten en cuenta: ${options.notes.trim()}` : '',
    '',
    'Condiciones:',
    `- Comidas de cada día: ${meals}.`,
    '- Usa alimentos sencillos y comunes en España, con su nombre genérico (por ejemplo "pechuga de pollo", "arroz blanco", "yogur natural"). Evita marcas.',
    '- Indica la cantidad de cada alimento en gramos, ya preparada para pesar en crudo.',
    '- No calcules calorías ni macros: yo los calculo con mi propia base de datos.',
    '',
    'Responde SOLO con este JSON, sin texto alrededor:',
    '{"dias":[{"dia":"lunes","comidas":{"desayuno":[{"alimento":"copos de avena","gramos":60}],"comida":[],"merienda":[],"cena":[]}}]}',
  ]
    .filter(Boolean)
    .join('\n')
}

export interface ImportedItem {
  name: string
  grams: number
}

export interface ImportedDay {
  /** 0 = Monday. */
  index: number
  meals: Record<Meal, ImportedItem[]>
}

export interface ParsedPlan {
  days: ImportedDay[]
  /** What was ignored, to show after importing. */
  issues: string[]
}

/** Pulls the JSON out of an answer that may carry code fences or chatter around it. */
export function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates = [fence?.[1], sliceBalanced(text), text]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      return JSON.parse(candidate)
    } catch {
      continue
    }
  }
  return null
}

function sliceBalanced(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1)
  }
  return null
}

const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value.replace(',', '.').replace(/[^\d.]/g, '')) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/** Reads the answer into days and meals, skipping whatever doesn't fit. */
export function parsePlan(value: unknown): ParsedPlan {
  const issues: string[] = []
  const root = value as { dias?: unknown; days?: unknown } | null
  const rawDays = (root?.dias ?? root?.days) as unknown[] | undefined
  if (!Array.isArray(rawDays)) return { days: [], issues: ['La respuesta no tiene una lista de días.'] }

  const days: ImportedDay[] = []
  rawDays.forEach((raw, position) => {
    const day = raw as { dia?: unknown; day?: unknown; comidas?: unknown; meals?: unknown }
    const index = dayIndex(day.dia ?? day.day, position)
    const rawMeals = (day.comidas ?? day.meals) as Record<string, unknown> | undefined
    if (!rawMeals || typeof rawMeals !== 'object') {
      issues.push(`Día ${position + 1}: sin comidas.`)
      return
    }
    const meals = emptyMeals()
    for (const [key, list] of Object.entries(rawMeals)) {
      const meal = MEAL_NAMES[fold(key)]
      if (!meal) {
        issues.push(`"${key}" no es una comida conocida.`)
        continue
      }
      if (!Array.isArray(list)) continue
      for (const entry of list) {
        const item = entry as { alimento?: unknown; nombre?: unknown; food?: unknown; gramos?: unknown; grams?: unknown }
        const name = String(item.alimento ?? item.nombre ?? item.food ?? '').trim()
        const grams = num(item.gramos ?? item.grams)
        if (!name) continue
        if (!grams) {
          issues.push(`"${name}" no trae cantidad en gramos.`)
          continue
        }
        meals[meal].push({ name, grams })
      }
    }
    days.push({ index, meals })
  })
  return { days, issues }
}

function emptyMeals(): Record<Meal, ImportedItem[]> {
  return { breakfast: [], lunch: [], snack: [], dinner: [] }
}

function dayIndex(value: unknown, position: number): number {
  const text = fold(String(value ?? ''))
  const named = DAY_NAMES.findIndex((d) => text.includes(d))
  if (named >= 0) return named
  const numbered = text.match(/\d+/)
  if (numbered) return Math.min(Math.max(Number(numbered[0]) - 1, 0), 6)
  return Math.min(position, 6)
}

export interface Match {
  food: Food
  /** 0 to 1: how much of the searched name the food covers. */
  score: number
}

/**
 * Best food for a name from the plan. Every word of the name has to appear for
 * a full score; shorter food names win ties, so "arroz blanco" beats "arroz
 * blanco con leche".
 */
export function matchFood(name: string, foods: Food[]): Match | null {
  const words = fold(name)
    .split(/[\s,]+/)
    .filter((w) => w.length > 2)
  if (!words.length) return null

  let best: Match | null = null
  for (const food of foods) {
    const hay = fold(food.name)
    const hits = words.filter((w) => hay.includes(w)).length
    if (!hits) continue
    const score = hits / words.length
    if (!best || score > best.score || (score === best.score && food.name.length < best.food.name.length)) best = { food, score }
  }
  return best && best.score >= 0.5 ? best : null
}

export const dayName = (index: number) => weekdayName(`2026-09-${14 + index}`)
