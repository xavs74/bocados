/**
 * Signing in with Google, as far as a first test needs.
 *
 *   GET  /auth/google      start: sends the person to Google
 *   GET  /auth/callback    Google sends them back here with a code
 *   GET  /auth/yo          who is signed in on this device, if anyone
 *   POST /auth/salir       sign out
 *   GET  /auth/exportar    everything the server holds about them
 *   POST /auth/borrar      delete the account and everything in it
 *
 * The session lives in a signed cookie. The account behind it is in D1
 * (worker/accounts.js) and holds only who someone is: their food, days and
 * goals stay on the device.
 *
 * The code is exchanged here, server side, with the client secret; the identity
 * comes back inside that answer over TLS straight from Google, so the token is
 * read rather than verified again.
 */

import { deleteUser, exportUser, signIn } from './accounts.js'

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const SESSION_COOKIE = 'bocados_sesion'
const STATE_COOKIE = 'bocados_estado'
/** A month: long enough that nobody signs in twice in a test. */
export const SESSION_SECONDS = 60 * 60 * 24 * 30
const STATE_SECONDS = 600

const PATHS = ['/auth/google', '/auth/callback', '/auth/yo', '/auth/salir', '/auth/exportar', '/auth/borrar']

export function isAuthPath(pathname) {
  return PATHS.includes(pathname)
}

export async function handleAuth(request, env) {
  const url = new URL(request.url)

  if (url.pathname === '/auth/yo') {
    const session = await readSession(request, env)
    const missing = missingSettings(env)
    return json({
      ...(session ? { signedIn: true, email: session.email, name: session.name } : { signedIn: false }),
      // Names only, never values: which of the three the server can't see.
      ...(missing.length ? { faltan: missing } : {}),
    })
  }

  if (url.pathname === '/auth/salir') {
    if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
    return json({ signedIn: false }, 200, { 'Set-Cookie': clearCookie(SESSION_COOKIE) })
  }

  if (url.pathname === '/auth/exportar' || url.pathname === '/auth/borrar') {
    const session = await readSession(request, env)
    if (!session?.uid) return json({ error: 'No has entrado' }, 401)
    if (!env.DB) return json({ error: 'La base de datos de cuentas no está configurada' }, 503)

    if (url.pathname === '/auth/exportar') {
      const taken = await exportUser(env.DB, session.uid)
      if (!taken) return json({ error: 'Esa cuenta ya no existe' }, 404, { 'Set-Cookie': clearCookie(SESSION_COOKIE) })
      return json(taken, 200, { 'Content-Disposition': 'attachment; filename="bocados-cuenta.json"' })
    }

    if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
    await deleteUser(env.DB, session.uid)
    // The session goes with the account, so the device is signed out too.
    return json({ deleted: true }, 200, { 'Set-Cookie': clearCookie(SESSION_COOKIE) })
  }

  const missing = missingSettings(env)
  if (missing.length) {
    return json({ error: 'Falta configurar el acceso con Google en el servidor', faltan: missing }, 503)
  }

  if (url.pathname === '/auth/google') return startGoogle(url, env)
  return finishGoogle(url, request, env)
}

async function startGoogle(url, env) {
  const state = crypto.randomUUID()
  const target = new URL(GOOGLE_AUTH)
  target.searchParams.set('client_id', env.GOOGLE_CLIENT_ID)
  target.searchParams.set('redirect_uri', redirectUri(url))
  target.searchParams.set('response_type', 'code')
  target.searchParams.set('scope', 'openid email profile')
  target.searchParams.set('state', state)
  // Always ask which account: phones are shared, and families share this app.
  target.searchParams.set('prompt', 'select_account')

  const signed = await sign(state, env.SESSION_SECRET)
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      'Set-Cookie': cookie(STATE_COOKIE, signed, STATE_SECONDS),
      'Cache-Control': 'no-store',
    },
  })
}

async function finishGoogle(url, request, env) {
  const error = url.searchParams.get('error')
  if (error) return backToApp(url, `error=${encodeURIComponent(error)}`)

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expected = readCookie(request, STATE_COOKIE)
  if (!code || !state || !expected || !(await verify(state, expected, env.SESSION_SECRET))) {
    return backToApp(url, 'error=estado')
  }

  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri(url),
    grant_type: 'authorization_code',
  })
  const answer = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!answer.ok) return backToApp(url, 'error=token')

  const { id_token: idToken } = await answer.json()
  const claims = readIdToken(idToken)
  if (!claims?.sub || !claims.email) return backToApp(url, 'error=identidad')
  if (!env.DB) return backToApp(url, 'error=sincuentas')

  let user
  try {
    user = await signIn(env.DB, { provider: 'google', subject: claims.sub, email: claims.email, name: claims.name ?? '' })
  } catch {
    return backToApp(url, 'error=cuenta')
  }

  const session = await sign(JSON.stringify({ uid: user.id, email: user.email, name: user.name, exp: now() + SESSION_SECONDS }), env.SESSION_SECRET)
  return backToApp(url, 'ok=1', [cookie(SESSION_COOKIE, session, SESSION_SECONDS), clearCookie(STATE_COOKIE)])
}

/** Back into the app itself, which on a phone may be the one on the home screen. */
function backToApp(url, query, cookies = []) {
  const headers = new Headers({ Location: `${url.origin}/#/cuenta?${query}`, 'Cache-Control': 'no-store' })
  for (const c of cookies) headers.append('Set-Cookie', c)
  return new Response(null, { status: 302, headers })
}

export async function readSession(request, env) {
  const raw = readCookie(request, SESSION_COOKIE)
  if (!raw || !env.SESSION_SECRET) return null
  const value = await open(raw, env.SESSION_SECRET)
  if (!value) return null
  try {
    const session = JSON.parse(value)
    return session.exp > now() ? session : null
  } catch {
    return null
  }
}

/** Which of the three settings the Worker cannot see, by name. */
export function missingSettings(env) {
  return ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET'].filter((name) => !String(env?.[name] ?? '').trim())
}

export const redirectUri = (url) => `${url.origin}/auth/callback`

/** The claims inside an id_token, without the signature: see the note above. */
export function readIdToken(token) {
  const payload = String(token || '').split('.')[1]
  if (!payload) return null
  const text = fromBase64(payload.replace(/-/g, '+').replace(/_/g, '/'))
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Base64 of the text's own bytes. Going through btoa/atob instead would read
 * each byte as a character: "Ramírez" comes back as "RamÃ­rez", and a name
 * outside Latin-1 makes btoa throw, which would stop sign-in altogether.
 */
function toBase64(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(base64) {
  let binary
  try {
    binary = atob(base64)
  } catch {
    return null
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

export function readCookie(request, name) {
  const header = request.headers.get('Cookie') || ''
  const found = header.split(';').find((part) => part.trim().startsWith(`${name}=`))
  return found ? decodeURIComponent(found.trim().slice(name.length + 1)) : null
}

const now = () => Math.floor(Date.now() / 1000)

function cookie(name, value, seconds) {
  // Lax so the cookie still travels on the redirect back from Google.
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`
}

function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
}

/** value.signature, so what comes back can be trusted without storing it. */
export async function sign(value, secret) {
  const mac = await hmac(value, secret)
  return `${toBase64(value).replace(/=+$/, '')}.${mac}`
}

export async function open(signed, secret) {
  const dot = String(signed).lastIndexOf('.')
  if (dot < 1) return null
  const value = fromBase64(signed.slice(0, dot))
  if (value === null) return null
  return (await equal(await hmac(value, secret), signed.slice(dot + 1))) ? value : null
}

/** True when `signed` carries exactly this value. */
export async function verify(value, signed, secret) {
  return (await open(signed, secret)) === value
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Compared through a digest so the time it takes says nothing about the value. */
async function equal(a, b) {
  const [da, db] = await Promise.all([digest(a), digest(b)])
  return da === db
}

async function digest(value) {
  const out = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)))
  return [...new Uint8Array(out)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  })
}
