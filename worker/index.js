/**
 * Cloudflare Worker for Bocados.
 *
 * It serves the built site (the `assets` binding) and adds a small API in
 * front of Open Food Facts:
 *
 *   GET /api/buscar?q=pechuga+hacendado   search supermarket products
 *   GET /api/codigo/8480000123456         look one up by barcode
 *
 * It also answers /auth/* for signing in (worker/auth.js) and /sync, which
 * carries rows between someone's devices (worker/sync.js).
 *
 * Open Food Facts allows only 10 searches a minute per address and doesn't let
 * browsers call its search directly, so every request goes through here, with
 * answers cached so repeated searches don't reach them at all.
 */

import { handleAuth, isAuthPath, readSession } from './auth.js'
import { handleSync } from './sync.js'

const SEARCH_URL = 'https://search.openfoodfacts.org/search'
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product'
const USER_AGENT = 'Bocados/1.0 (https://bocados.org)'
const FIELDS = 'code,product_name,product_name_es,brands,nutriments,serving_size,serving_quantity,quantity,countries_tags'
/** How long answers stay cached: products change rarely. */
const CACHE_SECONDS = 86400

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (isAuthPath(url.pathname)) return await handleAuth(request, env)
    if (url.pathname === '/sync') {
      const session = await readSession(request, env)
      if (!session?.uid) return json({ error: 'No has entrado' }, 401)
      return await handleSync(request, env, session)
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (request.method !== 'GET') return json({ error: 'Método no permitido' }, 405)

    try {
      if (url.pathname === '/api/buscar') return await cached(request, ctx, () => search(url.searchParams.get('q') || ''))
      const barcode = url.pathname.match(/^\/api\/codigo\/(\d{6,14})$/)?.[1]
      if (barcode) return await cached(request, ctx, () => byBarcode(barcode))
      return json({ error: 'No encontrado' }, 404)
    } catch (e) {
      return json({ error: 'No se pudo consultar Open Food Facts', detail: String(e) }, 502)
    }
  },
}

/** Serves from the edge cache when possible, and stores what the handler returns. */
async function cached(request, ctx, handler) {
  const cache = caches.default
  const key = new Request(new URL(request.url).toString(), { method: 'GET' })
  const hit = await cache.match(key)
  if (hit) return hit

  const response = await handler()
  if (response.ok) ctx.waitUntil(cache.put(key, response.clone()))
  return response
}

async function search(query) {
  const q = query.trim()
  if (q.length < 3) return json({ items: [] })

  const url = new URL(SEARCH_URL)
  url.searchParams.set('q', q)
  url.searchParams.set('page_size', '60')
  url.searchParams.set('fields', FIELDS)
  const upstream = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
  if (!upstream.ok) return json({ error: 'Open Food Facts no responde ahora mismo', status: upstream.status }, 503)

  const data = await upstream.json()
  const items = []
  const seen = new Set()
  for (const hit of data.hits ?? []) {
    const item = normalize(hit)
    if (!item) continue
    const key = `${item.name}|${item.brand}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }
  return json({ items: rank(items, q).slice(0, 12) })
}

async function byBarcode(barcode) {
  const url = `${PRODUCT_URL}/${barcode}.json?fields=${FIELDS}`
  const upstream = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
  if (upstream.status === 404) return json({ item: null, reason: 'desconocido' }, 404)
  if (!upstream.ok) return json({ error: 'Open Food Facts no responde ahora mismo', status: upstream.status }, 503)

  const data = await upstream.json()
  const item = data.status === 1 ? normalize(data.product) : null
  if (!item) return json({ item: null, reason: data.status === 1 ? 'incompleto' : 'desconocido' }, 404)
  return json({ item })
}

/**
 * Open Food Facts ranks loosely: "pechuga hacendado" brings back any product
 * with either word. Products matching every word come first, then the ones
 * sold in Spain.
 */
export function rank(items, query) {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const scored = items.map((item) => {
    const haystack = fold(`${item.name} ${item.brand ?? ''}`)
    const hits = words.filter((w) => haystack.includes(w)).length
    return { item, all: hits === words.length, hits }
  })
  // Products matching every word first, then near matches, so a query like
  // "atun claro hacendado" still offers other tuna if only one matches in full.
  return scored
    .filter((s) => s.hits > 0)
    .sort(
      (a, b) =>
        Number(b.all) - Number(a.all) ||
        b.hits - a.hits ||
        Number(b.item.spain) - Number(a.item.spain) ||
        a.item.name.length - b.item.name.length,
    )
    .map((s) => s.item)
}

const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Keeps only products with a name and usable values per 100 g. */
export function normalize(product) {
  if (!product) return null
  const n = product.nutriments ?? {}
  const name = clean(product.product_name_es || product.product_name)
  if (!name) return null

  let kcal = num(n['energy-kcal_100g'])
  if (kcal === null) {
    const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g'])
    if (kj !== null) kcal = kj / 4.184
  }
  const carbs = num(n.carbohydrates_100g)
  const protein = num(n.proteins_100g)
  const fat = num(n.fat_100g)
  if (kcal === null || carbs === null || protein === null || fat === null) return null
  if (kcal <= 0 || kcal > 950) return null

  const brands = Array.isArray(product.brands) ? product.brands : String(product.brands ?? '').split(',')
  const brand = clean(brands[0]) || null
  return {
    code: product.code ?? null,
    name: withoutBrand(name, brand),
    brand,
    kcal: round(kcal),
    carbs: round(carbs),
    protein: round(protein),
    fat: round(fat),
    serving: servingGrams(product),
    spain: (product.countries_tags ?? []).includes('en:spain'),
  }
}

/** Names often repeat the brand: "Fricandó - Hacendado - Hacendado". */
export function withoutBrand(name, brand) {
  let out = name
  const tail = brand ? [brand] : []
  for (const word of tail) {
    const re = new RegExp(`\\s*[-–]\\s*${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i')
    while (re.test(out)) out = out.replace(re, '')
  }
  return out.trim() || name
}

/** Grams in one serving, when Open Food Facts states it in grams or millilitres. */
export function servingGrams(product) {
  const q = num(product.serving_quantity)
  if (q !== null && q > 0 && q < 2000) return round(q)
  const match = String(product.serving_size ?? '').match(/([\d.,]+)\s*(g|ml)\b/i)
  if (!match) return null
  const grams = Number(match[1].replace(',', '.'))
  return Number.isFinite(grams) && grams > 0 && grams < 2000 ? round(grams) : null
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const round = (n) => Math.round(n * 10) / 10

function num(value) {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? `public, max-age=3600, s-maxage=${CACHE_SECONDS}` : 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
