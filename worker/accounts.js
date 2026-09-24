/**
 * The accounts themselves, in Cloudflare's database (D1).
 *
 * What is kept is deliberately thin: an id, an email address, a name, and which
 * ways of signing in belong to it. No food, no days, no weights, no goals —
 * those stay on the device. When sync arrives they get their own tables and
 * their own decision.
 *
 * Every function takes the database, so the same code runs against D1 in
 * production and against SQLite in the tests.
 */

const PROVIDERS = ['google', 'email']

export const cleanEmail = (email) => String(email || '').trim().toLowerCase()

/**
 * The account behind someone who has just proved who they are, creating it the
 * first time. An address that already has an account keeps it, whichever way
 * they signed in, so nobody ends up with two.
 */
export async function signIn(db, { provider, subject, email, name = '', now = new Date().toISOString() }) {
  if (!PROVIDERS.includes(provider)) throw new Error(`Unknown provider: ${provider}`)
  const address = cleanEmail(email)
  if (!address || !subject) throw new Error('An identity needs a subject and an email')

  const known = await db.prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?').bind(provider, String(subject)).first()
  if (known) {
    const user = await touch(db, known.user_id, { email: address, name, now })
    if (user) return user
    // The account was deleted while this identity lingered: start again.
    await db.prepare('DELETE FROM identities WHERE provider = ? AND subject = ?').bind(provider, String(subject)).run()
  }

  const byEmail = await db.prepare('SELECT * FROM users WHERE email = ?').bind(address).first()
  const user = byEmail ?? (await create(db, { email: address, name, now }))
  await db
    .prepare('INSERT OR REPLACE INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)')
    .bind(provider, String(subject), user.id, now)
    .run()
  return byEmail ? await touch(db, user.id, { email: address, name, now }) : user
}

async function create(db, { email, name, now }) {
  const id = crypto.randomUUID()
  await db.prepare('INSERT INTO users (id, email, name, created_at, seen_at) VALUES (?, ?, ?, ?, ?)').bind(id, email, name, now, now).run()
  return { id, email, name, created_at: now, seen_at: now }
}

/** Marks the account as seen, and keeps the name fresh if the provider has one. */
async function touch(db, id, { email, name, now }) {
  const user = await getUser(db, id)
  if (!user) return null
  const nextName = name || user.name
  await db.prepare('UPDATE users SET seen_at = ?, name = ?, email = ? WHERE id = ?').bind(now, nextName, email || user.email, id).run()
  return { ...user, name: nextName, email: email || user.email, seen_at: now }
}

export async function getUser(db, id) {
  return (await db.prepare('SELECT * FROM users WHERE id = ?').bind(String(id)).first()) ?? null
}

/**
 * Writes down that someone agreed to their food and weight being kept. Only
 * after this does anything of theirs travel: see the account screen.
 */
export async function recordConsent(db, id, version, now = new Date().toISOString()) {
  await db.prepare('UPDATE users SET consent_at = ?, consent_version = ? WHERE id = ?').bind(now, String(version), String(id)).run()
  return getUser(db, id)
}

/** Withdrawn consent stops sync; the data itself is removed separately. */
export async function withdrawConsent(db, id) {
  await db.prepare('UPDATE users SET consent_at = NULL, consent_version = NULL WHERE id = ?').bind(String(id)).run()
}

/** Everything the server holds about someone, for them to take away. */
export async function exportUser(db, id) {
  const user = await getUser(db, id)
  if (!user) return null
  const { results } = await db.prepare('SELECT provider, subject, created_at FROM identities WHERE user_id = ? ORDER BY created_at').bind(String(id)).all()
  return { cuenta: user, formas_de_entrar: results ?? [], nota: 'Bocados no guarda en el servidor tus alimentos, tus días ni tus objetivos.' }
}

/** Removes the account and every way of signing in to it. Nothing is kept. */
export async function deleteUser(db, id) {
  const user = await getUser(db, id)
  if (!user) return false
  await db.prepare('DELETE FROM identities WHERE user_id = ?').bind(String(id)).run()
  await db.prepare('DELETE FROM users WHERE id = ?').bind(String(id)).run()
  return true
}
