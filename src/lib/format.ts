const intFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const oneFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

export const kcal = (n: number) => intFmt.format(Math.round(n))
export const grams = (n: number) => `${oneFmt.format(n)} g`
export const num = (n: number) => oneFmt.format(n)
export const pct = (n: number) => `${intFmt.format(Math.round(n))}%`

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
