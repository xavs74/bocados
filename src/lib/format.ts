export const LOCALE = 'es-ES'

const intFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0, useGrouping: 'always' })
const oneFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 })

export const kcal = (n: number) => intFmt.format(Math.round(n))
export const grams = (n: number) => `${oneFmt.format(n)} g`
export const num = (n: number) => oneFmt.format(n)
// Spanish puts a space before %; a non-breaking one keeps the sign on the number's line.
export const pct = (n: number) => `${intFmt.format(Math.round(n))}\u00a0%`

/** Plain number for an editable input, with a decimal comma. */
export const inputNum = (n: number) => String(+n.toFixed(2)).replace('.', ',')

/** Parses user input, accepting a comma or a dot as decimal separator. */
export const parseNum = (s: string) => (s.trim() === '' ? NaN : Number(s.trim().replace(',', '.')))

/** Case- and accent-insensitive match of every word in the query. */
export function matches(name: string, query: string): boolean {
  const hay = normalize(name)
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word))
}

function normalize(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}
