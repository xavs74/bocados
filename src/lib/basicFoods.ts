import seedFoods from '../data/seedFoods.json'
import { db, type Food } from '../db'

const key = (name: string) => name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()

/** Built-in foods this device doesn't have yet, matched by name. */
export function missingBasicFoods(existing: Pick<Food, 'name'>[]): typeof seedFoods {
  const have = new Set(existing.map((f) => key(f.name)))
  return seedFoods.filter((f) => !have.has(key(f.name)))
}

/**
 * Adds the built-in foods that are missing. New installs get the list
 * automatically; this is for devices that started with an older list.
 */
export async function addMissingBasicFoods(): Promise<number> {
  return db.transaction('rw', db.foods, async () => {
    const missing = missingBasicFoods(await db.foods.toArray())
    await db.foods.bulkAdd(missing as Food[])
    return missing.length
  })
}
