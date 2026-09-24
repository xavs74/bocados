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

/**
 * How every row is identified. A random string rather than a number counted by
 * the device, so the same row means the same thing on every phone: two devices
 * would both hand out 5, to different foods.
 */
export type Id = string

/**
 * Rows that travel between devices carry when they last changed. The database
 * sets it on every write (see the hooks below), so nothing that saves a row has
 * to remember it.
 */
export interface Synced {
  updatedAt?: number
}

/** Nutrients are per 100 g. */
export interface Food extends Nutrients, Synced {
  id: Id
  name: string
  servings: Serving[]
  /** One of CATEGORIES for built-in foods; missing for foods people create. */
  category?: string
  /**
   * Grams of alcohol per 100 g, for drinks. Their calories come from it rather
   * than from the macros, so without it a beer looks like a mistake.
   */
  alcohol?: number
  /** Set for products copied from Open Food Facts. */
  barcode?: string
  source?: string
  /** Set on the food that mirrors a recipe, so editing opens the recipe. */
  recipeId?: Id
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
export interface Entry extends Synced {
  id: Id
  date: string
  meal: Meal
  foodId: Id
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
export interface Recipe extends Synced {
  id: Id
  name: string
  /** How many servings the whole recipe makes. */
  servings: number
  ingredients: Ingredient[]
  /** The food that mirrors this recipe. */
  foodId?: Id
  createdAt: number
}

/** One logged food inside a saved meal, without the day it belonged to. */
export type MealSetItem = Pick<Entry, 'foodId' | 'name' | 'per100' | 'grams' | 'amount'>

/** A group of foods eaten together, logged in one go ("desayuno de siempre"). */
export interface MealSet extends Synced {
  id: Id
  name: string
  items: MealSetItem[]
  createdAt: number
  lastUsed?: number
}

/** A food planned for a day and meal, before it's actually eaten. */
export interface Planned extends Synced {
  id: Id
  date: string
  meal: Meal
  foodId: Id
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
export interface Weight extends Synced {
  date: string
  kg: number
  createdAt: number
}

/**
 * A row that was deleted, kept so the deletion can travel too. Without it, a day
 * deleted on the phone would come back from another device.
 */
export interface Tombstone {
  /** table:id, so one table's row can't shadow another's. */
  id: string
  table: string
  uid: string
  deletedAt: number
}

/**
 * How far this device has got with syncing. It stays on the device: a cursor
 * copied to another phone would make it skip everything it has not seen.
 */
export interface SyncState {
  id: 'state'
  /** The account's running count this device has caught up with. */
  cursor: number
  /** Changes made after this have not been sent yet. */
  pushedAt: number
  lastAt?: number
  /** Off until the person has decided what happens to this device's data. */
  enabled?: boolean
}

/** What everything looked like just before the identifiers changed. */
export interface Snapshot {
  id: string
  at: string
  tables: Record<string, unknown[]>
}

export interface Setting extends Partial<Synced> {
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
  tombstones!: EntityTable<Tombstone, 'id'>
  snapshots!: EntityTable<Snapshot, 'id'>
  sync!: EntityTable<SyncState, 'id'>

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

    /*
     * Versions 8 to 11 swap the numbers the device counted out for identifiers
     * that mean the same thing on every device, which is what syncing needs.
     * IndexedDB cannot change a table's key, so the tables are copied aside,
     * dropped, made again and filled back in. Version 8 also keeps a copy of
     * everything as it was, in case any of this goes wrong.
     */
    this.version(8).stores({ migration: 'id', snapshots: 'id' }).upgrade(async (tx) => {
      const names = ['foods', 'entries', 'mealSets', 'recipes', 'planned']
      const old: Record<string, Record<string, unknown>[]> = {}
      for (const name of names) old[name] = await tx.table(name).toArray()

      await tx.table('snapshots').put({ id: 'antes-de-los-identificadores', at: new Date().toISOString(), tables: old })

      // One new identifier per row, then every reference rewritten to match.
      const ids: Record<string, Map<number, Id>> = {}
      for (const name of names) ids[name] = new Map(old[name].map((row) => [row.id as number, newId()]))

      const food = (oldId: unknown) => (typeof oldId === 'number' ? (ids.foods.get(oldId) ?? `borrado-${oldId}`) : (oldId as Id))
      const withFood = (item: Record<string, unknown>) => ({ ...item, foodId: food(item.foodId) })

      const rewritten: Record<string, Record<string, unknown>[]> = {}
      for (const name of names) {
        rewritten[name] = old[name].map((row) => {
          const next: Record<string, unknown> = { ...row, id: ids[name].get(row.id as number)!, updatedAt: (row.createdAt as number) || Date.now() }
          if (name === 'foods' && typeof row.recipeId === 'number') next.recipeId = ids.recipes.get(row.recipeId) ?? undefined
          if (name === 'entries' || name === 'planned') next.foodId = food(row.foodId)
          if (name === 'recipes') {
            next.foodId = typeof row.foodId === 'number' ? food(row.foodId) : undefined
            next.ingredients = ((row.ingredients ?? []) as Record<string, unknown>[]).map(withFood)
          }
          if (name === 'mealSets') next.items = ((row.items ?? []) as Record<string, unknown>[]).map(withFood)
          return next
        })
      }

      for (const name of names) await tx.table('migration').put({ id: name, rows: rewritten[name] })
    })

    // Version 9 drops the tables keyed by a number: the key itself cannot change.
    this.version(9).stores({ foods: null, entries: null, mealSets: null, recipes: null, planned: null })

    // Version 10 makes them again, keyed by the new identifier, and fills them back in.
    this.version(10)
      .stores({
        foods: 'id, name, lastUsed, barcode, updatedAt',
        entries: 'id, date, foodId, updatedAt',
        mealSets: 'id, name, lastUsed, updatedAt',
        recipes: 'id, name, updatedAt',
        planned: 'id, date, updatedAt',
        weights: 'date, updatedAt',
        settings: 'key, updatedAt',
        tombstones: 'id, deletedAt',
      })
      .upgrade(async (tx) => {
        for (const name of ['foods', 'entries', 'mealSets', 'recipes', 'planned']) {
          const stored = await tx.table('migration').get(name)
          if (stored?.rows?.length) await tx.table(name).bulkAdd(stored.rows)
        }
        const now = Date.now()
        for (const name of ['weights', 'settings']) {
          await tx
            .table(name)
            .toCollection()
            .modify((row: Record<string, unknown>) => {
              row.updatedAt = (row.createdAt as number) || now
            })
        }
      })

    // Version 11 clears the copies made along the way; the snapshot stays.
    this.version(11).stores({ migration: null })

    // Version 12 remembers how far this device has got with syncing.
    this.version(12).stores({ sync: 'id' })

    // Only a brand new database of this person's own starts with the built-in
    // foods; the one opened to read someone's old data must stay as it was.
    if (seed) {
      this.on('populate', async (tx) => {
        await tx.table('foods').bulkAdd(seedFoods)
        await tx.table('settings').add({ key: 'goals', value: DEFAULT_GOALS })
      })
    }
  }
}

/** A new identifier: unique wherever it is made, so devices never collide. */
export const newId = (): Id => crypto.randomUUID()

export const db = new BocadosDB('bocados', { seed: true })

/** Tables that travel between devices, with the key each one is known by. */
export const SYNCED_TABLES = ['foods', 'entries', 'mealSets', 'recipes', 'planned', 'weights', 'settings'] as const

let recording = true

const writeWatchers = new Set<() => void>()

/** Told whenever something on this device changes, so syncing can follow along. */
export function onLocalWrite(fn: () => void): () => void {
  writeWatchers.add(fn)
  return () => void writeWatchers.delete(fn)
}

function localWrite() {
  if (recording) for (const fn of writeWatchers) fn()
}

/**
 * Runs something without marking what it deletes. Restoring a copy empties every
 * table and fills it again: those are not deletions, and marking them would tell
 * the other devices to delete everything.
 */
export async function withoutTombstones<T>(fn: () => Promise<T>): Promise<T> {
  recording = false
  try {
    return await fn()
  } finally {
    recording = true
  }
}

/**
 * Identifiers, timestamps and tombstones are kept by the database itself rather
 * than by whoever writes to it, so no call site can forget one. The tombstone
 * is written once the delete has actually gone through, so a transaction that
 * rolls back cannot leave a row marked as deleted while it is still there.
 */
/**
 * Attaches those hooks to a database. The app's own is done below; the tests
 * open more of them to play two devices against each other.
 */
export function attachHooks(database: BocadosDB): void {
  for (const name of SYNCED_TABLES) {
    const table = database.table(name)
    const keyed = name === 'weights' || name === 'settings'

    table.hook('creating', (_key, row: Record<string, unknown>) => {
      if (!keyed && !row.id) row.id = newId()
      if (!row.updatedAt) row.updatedAt = Date.now()
      localWrite()
    })

    table.hook('updating', (changes) => {
      localWrite()
      return 'updatedAt' in (changes as Record<string, unknown>) ? undefined : { updatedAt: Date.now() }
    })

    table.hook('deleting', (key, row, transaction) => {
      // Dexie calls this even for a key that isn't there; nothing was deleted then.
      if (!recording || !row) return
      const uid = String(key)
      // The delete's own transaction covers only its table, so the mark is
      // written once that has committed. A delete that rolls back leaves none.
      transaction.on('complete', () => {
        void database.tombstones.put({ id: `${name}:${uid}`, table: name, uid, deletedAt: Date.now() })
        localWrite()
      })
    })
  }
}

attachHooks(db)

/**
 * Why the screens have no data. Everything is read through live queries, and a
 * database that never opens leaves them waiting for ever, which looks like an
 * empty app; this says what happened instead.
 *
 * 'blocked' is the one that bites on phones: another window or tab still has an
 * older version of the database open, so the upgrade can't run.
 */
export type DbStatus = 'opening' | 'open' | 'blocked' | 'failed'

let dbStatus: DbStatus = 'opening'
export let dbError = ''
const watchers = new Set<(s: DbStatus) => void>()

export const getDbStatus = () => dbStatus

export function watchDbStatus(fn: (s: DbStatus) => void): () => void {
  watchers.add(fn)
  return () => void watchers.delete(fn)
}

function setDbStatus(status: DbStatus, error = '') {
  dbStatus = status
  dbError = error
  for (const fn of watchers) fn(status)
}

// Another window wants to upgrade: let go of the database so it can.
db.on('versionchange', () => {
  db.close()
  setDbStatus('blocked')
})
db.on('blocked', () => setDbStatus('blocked'))
db.open().then(
  () => setDbStatus('open'),
  (e: Error) => setDbStatus('failed', e.message),
)

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
