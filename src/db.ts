import Dexie, { type EntityTable } from 'dexie'
import seedFoods from './data/seedFoods.json'
import type { Goals, Nutrients } from './lib/nutrition'

export interface Serving {
  label: string
  grams: number
}

export interface Amount {
  quantity: number
  /** A serving label from the food, or undefined for grams. */
  serving?: Serving
}

/** Nutrients are per 100 g. */
export interface Food extends Nutrients {
  id: number
  name: string
  servings: Serving[]
  /** One of CATEGORIES for built-in foods; missing for foods people create. */
  category?: string
  /** Set for products copied from Open Food Facts. */
  barcode?: string
  source?: string
  /** Set on the food that mirrors a recipe, so editing opens the recipe. */
  recipeId?: number
  lastUsed?: number
  lastAmount?: Amount
}

/** Every meal Bocados knows, in the order of the day. Each person switches on the ones they use. */
export const MEALS = ['breakfast', 'midmorning', 'lunch', 'snack', 'dinner', 'latenight'] as const
export type Meal = (typeof MEALS)[number]

export const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'Desayuno',
  midmorning: 'Media mañana',
  lunch: 'Comida',
  snack: 'Merienda',
  dinner: 'Cena',
  latenight: 'Recena',
}

/** Meals switched on until someone changes them. */
export const DEFAULT_MEALS: Meal[] = ['breakfast', 'lunch', 'snack', 'dinner']

/**
 * A logged food. Keeps a copy of the food's name and values so editing or
 * deleting the food later doesn't rewrite past days.
 */
export interface Entry {
  id: number
  date: string
  meal: Meal
  foodId: number
  name: string
  per100: Nutrients
  grams: number
  amount: Amount
  createdAt: number
}

/** One ingredient of a recipe, with the amount used in the whole recipe. */
export type Ingredient = Pick<Entry, 'foodId' | 'name' | 'per100' | 'grams' | 'amount'>

/**
 * A dish made of foods. Bocados keeps a food in sync with it (values per 100 g
 * plus a "1 ración" serving), so a recipe is logged like any other food.
 */
export interface Recipe {
  id: number
  name: string
  /** How many servings the whole recipe makes. */
  servings: number
  ingredients: Ingredient[]
  /** The food that mirrors this recipe. */
  foodId?: number
  createdAt: number
}

/** One logged food inside a saved meal, without the day it belonged to. */
export type MealSetItem = Pick<Entry, 'foodId' | 'name' | 'per100' | 'grams' | 'amount'>

/** A group of foods eaten together, logged in one go ("desayuno de siempre"). */
export interface MealSet {
  id: number
  name: string
  items: MealSetItem[]
  createdAt: number
  lastUsed?: number
}

/** A food planned for a day and meal, before it's actually eaten. */
export interface Planned {
  id: number
  date: string
  meal: Meal
  foodId: number
  name: string
  per100: Nutrients
  grams: number
  amount: Amount
  createdAt: number
}

/**
 * A weigh-in. The date is the key, so weighing twice in a day replaces the
 * day's value; nothing asks anyone to weigh daily.
 */
export interface Weight {
  date: string
  kg: number
  createdAt: number
}

export interface Setting {
  key: string
  value: unknown
}

// Starting point taken from the spreadsheet: 1,700 kcal, with its target grams
// (130 g carbs, 234.5 g protein, 69.5 g fat) expressed as a calorie split.
export const DEFAULT_GOALS: Goals = { kcal: 1700, split: { carbs: 25, protein: 45, fat: 30 } }

const SERVING_ES: Record<string, string> = {
  '1 unit': '1 unidad',
  '1 bar': '1 barrita',
  '1 slice': '1 loncha',
  '1 cup': '1 taza',
}

export class BocadosDB extends Dexie {
  foods!: EntityTable<Food, 'id'>
  entries!: EntityTable<Entry, 'id'>
  mealSets!: EntityTable<MealSet, 'id'>
  recipes!: EntityTable<Recipe, 'id'>
  planned!: EntityTable<Planned, 'id'>
  settings!: EntityTable<Setting, 'key'>
  weights!: EntityTable<Weight, 'date'>

  constructor(name: string, { seed }: { seed: boolean }) {
    super(name)
    this.version(1).stores({
      foods: '++id, name, lastUsed',
      entries: '++id, date, foodId',
      settings: 'key',
    })
    // Version 2 translated the imported serving names to Spanish.
    this.version(2).stores({}).upgrade(async (tx) => {
      const rename = (s: Serving) => ({ ...s, label: SERVING_ES[s.label] ?? s.label })
      await tx.table('foods').toCollection().modify((f: Food) => {
        f.servings = f.servings.map(rename)
        if (f.lastAmount?.serving) f.lastAmount.serving = rename(f.lastAmount.serving)
      })
      await tx.table('entries').toCollection().modify((e: Entry) => {
        if (e.amount.serving) e.amount.serving = rename(e.amount.serving)
      })
    })
    if (seed) {
      // Version 3 indexes the barcode of products copied from Open Food Facts.
    this.version(3).stores({ foods: '++id, name, lastUsed, barcode' })
    // Version 4 adds saved meals.
    this.version(4).stores({ mealSets: '++id, name, lastUsed' })
    // Version 5 adds recipes.
    this.version(5).stores({ recipes: '++id, name' })
    // Version 6 adds the weekly plan.
    this.version(6).stores({ planned: '++id, date' })
    // Version 7 adds weigh-ins, one per day.
    this.version(7).stores({ weights: 'date' })
    this.on('populate', async (tx) => {
        await tx.table('foods').bulkAdd(seedFoods)
        await tx.table('settings').add({ key: 'goals', value: DEFAULT_GOALS })
      })
    }
  }
}

export const db = new BocadosDB('bocados', { seed: true })

/** The app was called Bocado before; its data lived in a database of that name. */
const LEGACY_DB = 'bocado'
const LEGACY_IMPORTED = 'legacyImported'

/**
 * Moves data from the old "bocado" database into "bocados", once. The copy and
 * its marker are written in one transaction, so a failed copy is retried on the
 * next start instead of being skipped.
 */
export async function migrateLegacyDb(): Promise<void> {
  if (!(await Dexie.exists(LEGACY_DB))) return
  const legacy = new BocadosDB(LEGACY_DB, { seed: false })
  try {
    if (!(await db.settings.get(LEGACY_IMPORTED))) {
      const [foods, entries, settings] = await Promise.all([legacy.foods.toArray(), legacy.entries.toArray(), legacy.settings.toArray()])
      await db.transaction('rw', db.foods, db.entries, db.settings, async () => {
        await Promise.all([db.foods.clear(), db.entries.clear(), db.settings.clear()])
        await db.foods.bulkAdd(foods)
        await db.entries.bulkAdd(entries)
        await db.settings.bulkAdd(settings)
        await db.settings.put({ key: LEGACY_IMPORTED, value: new Date().toISOString() })
      })
    }
    legacy.close()
    await Dexie.delete(LEGACY_DB)
  } catch (e) {
    legacy.close()
    console.error('No se pudieron migrar los datos de Bocado', e)
  }
}

export function gramsOf(amount: Amount): number {
  return amount.serving ? amount.quantity * amount.serving.grams : amount.quantity
}
