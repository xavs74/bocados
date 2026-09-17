import { LOCALE } from './format'

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

export function dayLabel(iso: string): string {
  const today = isoDate()
  if (iso === today) return 'Hoy'
  if (iso === addDays(today, -1)) return 'Ayer'
  if (iso === addDays(today, 1)) return 'Mañana'
  return capitalize(parseIso(iso).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'short' }))
}

export function fullDate(iso: string): string {
  return capitalize(parseIso(iso).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }))
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
