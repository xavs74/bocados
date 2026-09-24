/**
 * Sync: one address, `POST /sync`.
 *
 *   → { since, items: [ { kind, uid, updatedAt, deleted, data } ] }
 *   ← { cursor, items: [ … ], more }
 *
 * A device sends what changed since its last sync and receives everything for
 * the account that is newer than the count it last saw. The server never looks
 * inside `data`: it keeps rows, in order, per account.
 *
 * When two devices change the same row, the later change wins, by the time the
 * device recorded. A tie keeps what is already stored, so both devices settle
 * on the same answer rather than flipping between two.
 */

/** What a row can be. Anything else is a bug or someone poking at the API. */
export const KINDS = ['food', 'entry', 'mealSet', 'recipe', 'planned', 'weight', 'setting']

export const LIMITS = {
  /** Rows accepted in one request. A first upload arrives in several. */
  batch: 500,
  /** Rows handed back at a time; `more` says whether to come again. */
  page: 500,
  /** One row's contents, which is generous for a food or a day. */
  item: 64 * 1024,
  /** Everything in one request. */
  body: 4 * 1024 * 1024,
  /** How far ahead of the server a device's clock may be. */
  futureMs: 5 * 60 * 1000,
}

export function checkItems(items, now = Date.now()) {
  if (!Array.isArray(items)) return { error: 'Faltan los cambios' }
  if (items.length > LIMITS.batch) return { error: `Demasiados cambios de una vez (máximo ${LIMITS.batch})` }

  const checked = []
  for (const item of items) {
    if (!item || typeof item !== 'object') return { error: 'Un cambio no es válido' }
    const { kind, uid, updatedAt, deleted, data } = item
    if (!KINDS.includes(kind)) return { error: `Tipo desconocido: ${String(kind).slice(0, 20)}` }
    if (typeof uid !== 'string' || !uid || uid.length > 200) return { error: 'Identificador no válido' }
    if (!Number.isFinite(updatedAt) || updatedAt < 0) return { error: 'Fecha de cambio no válida' }

    const text = deleted ? null : JSON.stringify(data ?? null)
    if (text && text.length > LIMITS.item) return { error: 'Un cambio es demasiado grande' }

    checked.push({
      kind,
      uid,
      // A device whose clock runs ahead would otherwise win every conflict for ever.
      updatedAt: Math.min(updatedAt, now + LIMITS.futureMs),
      deleted: deleted ? 1 : 0,
      data: text,
    })
  }
  return { items: checked }
}

/** Hands out the account's next numbers, so every write has its place in the order. */
export async function nextSeq(db, userId, count) {
  if (count <= 0) {
    const row = await db.prepare('SELECT seq FROM sync_seq WHERE user_id = ?').bind(userId).first()
    return row?.seq ?? 0
  }
  const row = await db
    .prepare('INSERT INTO sync_seq (user_id, seq) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET seq = seq + ? RETURNING seq')
    .bind(userId, count, count)
    .first()
  return row.seq
}

/**
 * Stores what a device sends. A change older than what is already here is
 * dropped, so a phone that has been offline for a week cannot undo newer edits.
 */
export async function push(db, userId, items) {
  if (!items.length) return
  const last = await nextSeq(db, userId, items.length)
  const first = last - items.length + 1
  const statement = db.prepare(
    `INSERT INTO items (user_id, kind, uid, updated_at, deleted, data, seq) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, kind, uid) DO UPDATE SET
       updated_at = excluded.updated_at, deleted = excluded.deleted, data = excluded.data, seq = excluded.seq
     WHERE excluded.updated_at > items.updated_at`,
  )
  await db.batch(items.map((item, i) => statement.bind(userId, item.kind, item.uid, item.updatedAt, item.deleted, item.data, first + i)))
}

/** Everything for the account after `since`, oldest first. */
export async function pull(db, userId, since) {
  const { results } = await db
    .prepare('SELECT kind, uid, updated_at, deleted, data, seq FROM items WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?')
    .bind(userId, since, LIMITS.page + 1)
    .all()

  const rows = results ?? []
  const more = rows.length > LIMITS.page
  const page = more ? rows.slice(0, LIMITS.page) : rows
  const cursor = page.length ? page[page.length - 1].seq : since

  return {
    cursor,
    more,
    items: page.map((row) => ({
      kind: row.kind,
      uid: row.uid,
      updatedAt: row.updated_at,
      deleted: !!row.deleted,
      ...(row.deleted ? {} : { data: JSON.parse(row.data ?? 'null') }),
    })),
  }
}

/**
 * How much the account holds, without handing any of it over. It is what the
 * first sign-in on a device needs: whether there is anything here at all, and
 * how many days of eating it adds up to.
 */
export async function accountSummary(db, userId) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS rows, COUNT(DISTINCT CASE WHEN kind = 'entry' THEN json_extract(data, '$.date') END) AS days FROM items WHERE user_id = ? AND deleted = 0`)
    .bind(userId)
    .first()
  return { rows: row?.rows ?? 0, days: row?.days ?? 0 }
}

/** Removes everything the account has stored, for deleting the account. */
export async function forgetUser(db, userId) {
  await db.batch([db.prepare('DELETE FROM items WHERE user_id = ?').bind(userId), db.prepare('DELETE FROM sync_seq WHERE user_id = ?').bind(userId)])
}

export async function handleSync(request, env, session) {
  if (!env.DB) return json({ error: 'El servidor no tiene base de datos' }, 503)
  if (request.method === 'GET') return json(await accountSummary(env.DB, session.uid))
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const length = Number(request.headers.get('Content-Length') ?? 0)
  if (length > LIMITS.body) return json({ error: 'Demasiados datos de una vez' }, 413)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'No se pudo leer la petición' }, 400)
  }

  const since = Number.isFinite(body?.since) && body.since >= 0 ? Math.floor(body.since) : 0
  const checked = checkItems(body?.items ?? [])
  if (checked.error) return json({ error: checked.error }, 400)

  await push(env.DB, session.uid, checked.items)
  return json(await pull(env.DB, session.uid, since))
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
