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

/** Monday of the week `iso` falls in. */
/** "25 sept", for labels with no room for more. */
export function shortDate(iso: string): string {
  return parseIso(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }).replace('.', '')
}

export function startOfWeek(iso: string): string {
  const d = parseIso(iso)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return isoDate(d)
}

export function weekDays(startIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startIso, i))
}

/** "15 – 21 de septiembre" or, across months, "29 de septiembre – 5 de octubre". */
export function weekLabel(startIso: string): string {
  const start = parseIso(startIso)
  const end = parseIso(addDays(startIso, 6))
  const sameMonth = start.getMonth() === end.getMonth()
  const from = start.toLocaleDateString(LOCALE, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'long' })
  const to = end.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })
  return `${from} – ${to}`
}

export function weekdayName(iso: string, style: 'long' | 'short' = 'long'): string {
  return capitalize(parseIso(iso).toLocaleDateString(LOCALE, { weekday: style }))
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
