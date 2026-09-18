import { MEALS, MEAL_LABEL, type Food, type Meal, type Recipe } from '../db'
import { SUPERMARKET_CATEGORY } from './categories'
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
export function buildPrompt(goals: Goals, options: { days: number; notes?: string; foodNames?: string[]; recipes?: { name: string; servingGrams: number }[] }): string {
  const g = goalGrams(goals)
  const meals = MEALS.map((m) => MEAL_LABEL[m].toLowerCase()).join(', ')
  const low = Math.round((goals.kcal * 0.95) / 10) * 10
  const high = Math.round((goals.kcal * 1.05) / 10) * 10
  const names = options.foodNames?.length ? options.foodNames.join(', ') : null
  return [
    `Hazme un plan de comidas de ${options.days} días para una persona con estos objetivos diarios:`,
    `- ${Math.round(goals.kcal)} kcal al día. El total de CADA día debe quedar entre ${low} y ${high} kcal.`,
    `- ${Math.round(g.carbs)} g de carbohidratos, ${Math.round(g.protein)} g de proteínas y ${Math.round(g.fat)} g de grasas al día (aproximado).`,
    options.notes?.trim() ? `- Ten en cuenta: ${options.notes.trim()}` : '',
    '',
    'Reglas importantes sobre las cantidades:',
    '- Pesos SIEMPRE en crudo y sin cocinar. El arroz, la pasta y las legumbres secas engordan al cocerse: si una comida lleva 250 g de arroz cocido, escribe 80 g de arroz (crudo). Lo mismo con pasta (unos 80 g en crudo por ración) y legumbres.',
    '- Escribe también el aceite, las salsas y las bebidas con leche, que suman muchas calorías.',
    '- Pesos de carne y pescado en crudo y sin hueso ni espinas.',
    '',
    'Comprobación obligatoria antes de responder:',
    '- Calcula tú el total de kcal de cada día con tus propios datos nutricionales.',
    `- Si algún día se sale de ${low}–${high} kcal, corrige las cantidades y vuelve a comprobarlo.`,
    '- Incluye ese total en el campo "kcal_estimado" de cada día. Yo recalculo todo con mi base de datos, pero me sirve para comparar.',
    '',
    'Otras condiciones:',
    `- Comidas de cada día: ${meals}.`,
    '- Alimentos sencillos y comunes en España, con nombre genérico. Evita marcas y platos complicados.',
    names ? `- Usa preferiblemente estos nombres, tal cual, porque son los que reconoce mi aplicación: ${names}.` : '',
    '- Puedes usar otros alimentos si hacen falta, pero con nombres genéricos y sencillos.',
    options.recipes?.length
      ? `- Tengo estas recetas; si encajan, úsalas como un solo alimento con su nombre y los gramos que toque: ${options.recipes.map((r) => `${r.name} (1 ración = ${Math.round(r.servingGrams)} g)`).join(', ')}.`
      : '',
    '',
    'Responde SOLO con este JSON, sin texto alrededor:',
    '{"dias":[{"dia":"lunes","kcal_estimado":0,"comidas":{"desayuno":[{"alimento":"copos de avena","gramos":60}],"comida":[],"merienda":[],"cena":[]}}]}',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Food names to offer the assistant: the ones this person uses most first,
 * then common staples, so the answer comes back in words the app matches.
 */
export function foodNamesForPrompt(foods: Food[], limit = 70): string[] {
  // Brand products are left out: the prompt asks for generic foods.
  const generic = foods.filter((f) => f.category !== SUPERMARKET_CATEGORY)
  const used = generic.filter((f) => f.lastUsed).sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
  const rest = generic.filter((f) => !f.lastUsed && f.category)
  const names: string[] = []
  for (const food of [...used, ...rest]) {
    if (names.length >= limit) break
    if (!names.includes(food.name)) names.push(food.name)
  }
  return names
}

export interface ImportedItem {
  name: string
  grams: number
}

export interface ImportedDay {
  /** 0 = Monday. */
  index: number
  meals: Record<Meal, ImportedItem[]>
  /** What the assistant thought the day added up to, when it said so. */
  claimedKcal?: number
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
    const claimed = num((day as { kcal_estimado?: unknown; kcal?: unknown }).kcal_estimado ?? (day as { kcal?: unknown }).kcal)
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
    days.push({ index, meals, claimedKcal: claimed ?? undefined })
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

/** Words that don't tell foods apart. */
const STOPWORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'con', 'sin', 'en', 'a', 'al', 'y', 'o', 'un', 'una', 'para', 'por'])

const words = (text: string) =>
  fold(text)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))

/**
 * Same word, allowing Spanish plurals: "claras" is "clara", "tomates" is
 * "tomate". Short words must match exactly, so "pan" isn't "panceta".
 */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 4 || b.length < 4) return false
  const [short, long] = a.length < b.length ? [a, b] : [b, a]
  return long.startsWith(short) && long.length - short.length <= 2
}

/**
 * Best food for a name from the plan. It must cover at least half the words of
 * the name; among those, the food whose own name is covered most wins, so
 * "claras de huevo" picks "Clara de huevo" and "huevos" picks "Huevo".
 * Qualifiers in brackets ("(crudo)") don't count against a food.
 */
export function matchFood(name: string, foods: Food[]): Match | null {
  const wanted = words(name)
  if (!wanted.length) return null

  let best: (Match & { precision: number }) | null = null
  for (const food of foods) {
    const own = words(food.name.replace(/\([^)]*\)/g, ''))
    if (!own.length) continue
    const recall = wanted.filter((w) => own.some((o) => sameWord(w, o))).length / wanted.length
    if (recall < 0.5) continue
    const precision = own.filter((o) => wanted.some((w) => sameWord(w, o))).length / own.length
    const better =
      !best ||
      recall > best.score ||
      (recall === best.score && precision > best.precision) ||
      (recall === best.score && precision === best.precision && food.name.length < best.food.name.length)
    if (better) best = { food, score: recall, precision }
  }
  return best ? { food: best.food, score: best.score } : null
}

/** A recipe whose every ingredient turned up in one meal of the plan. */
export interface RecipeHit {
  recipe: Recipe
  /** The rows the recipe would replace. */
  keys: string[]
  /** Their grams added up. */
  grams: number
}

/**
 * Finds recipes hiding in a meal: when all the ingredients of a recipe (two or
 * more) appear among the meal's foods, the meal is probably that dish.
 */
export function findRecipes(rows: { key: string; foodId?: number; grams: number }[], recipes: Recipe[]): RecipeHit[] {
  const hits: RecipeHit[] = []
  for (const recipe of recipes) {
    const ids = [...new Set(recipe.ingredients.map((i) => i.foodId))]
    if (ids.length < 2 || !recipe.foodId) continue
    const matched = rows.filter((r) => r.foodId !== undefined && ids.includes(r.foodId))
    if (ids.every((id) => matched.some((r) => r.foodId === id))) {
      hits.push({ recipe, keys: matched.map((r) => r.key), grams: matched.reduce((g, r) => g + r.grams, 0) })
    }
  }
  return hits
}

export const dayName = (index: number) => weekdayName(`2026-09-${14 + index}`)
