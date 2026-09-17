import { db, type Food } from '../db'
import { SUPERMARKET_CATEGORY } from './categories'

/** A supermarket product as the Worker returns it (values per 100 g). */
export interface Product {
  code: string | null
  name: string
  brand: string | null
  kcal: number
  carbs: number
  protein: number
  fat: number
  /** Grams in one serving, when the product states it. */
  serving: number | null
  spain: boolean
}

export const SOURCE = 'openfoodfacts'

/** Shortest query the Worker accepts; anything shorter matches half the database. */
export const MIN_QUERY = 3

export async function searchProducts(query: string, signal?: AbortSignal): Promise<Product[]> {
  const res = await fetch(`/api/buscar?q=${encodeURIComponent(query)}`, { signal })
  if (!res.ok) throw new Error('No se pudo buscar en Open Food Facts')
  const data = (await res.json()) as { items?: Product[] }
  return data.items ?? []
}

/** Null when the barcode isn't in Open Food Facts or the product has no usable values. */
export async function productByBarcode(barcode: string, signal?: AbortSignal): Promise<Product | null> {
  const res = await fetch(`/api/codigo/${encodeURIComponent(barcode)}`, { signal })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('No se pudo consultar Open Food Facts')
  const data = (await res.json()) as { item?: Product | null }
  return data.item ?? null
}

export const productLabel = (p: Product) => (p.brand ? `${p.name} · ${p.brand}` : p.name)

/**
 * Copies a product into the device's own food list, so it works offline
 * afterwards and can be edited. Returns the food already saved for that
 * barcode when there is one.
 */
export async function saveProduct(p: Product): Promise<Food> {
  const existing = p.code ? await db.foods.where('barcode').equals(p.code).first() : undefined
  if (existing) return existing
  const food = {
    name: productLabel(p),
    kcal: p.kcal,
    carbs: p.carbs,
    protein: p.protein,
    fat: p.fat,
    servings: p.serving ? [{ label: '1 ración', grams: p.serving }] : [],
    category: SUPERMARKET_CATEGORY,
    barcode: p.code ?? undefined,
    source: SOURCE,
  }
  const id = await db.foods.add(food as Food)
  return { ...food, id } as Food
}
