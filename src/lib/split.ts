import { MACROS, type MacroKey } from './nutrition'

export type Split = Record<MacroKey, number>

/** Smallest share any macro can have, so every segment stays grabbable. */
export const MIN_SHARE = 5

/**
 * Sets one macro's share and moves the other two to keep the total at 100,
 * preserving the ratio between them.
 */
export function rebalance(split: Split, key: MacroKey, value: number): Split {
  const v = clamp(Math.round(value), MIN_SHARE, 100 - 2 * MIN_SHARE)
  const [a, b] = MACROS.filter((m) => m !== key)
  const rest = 100 - v
  const oldSum = split[a] + split[b]
  const share = oldSum > 0 ? split[a] / oldSum : 0.5
  const newA = clamp(Math.round(rest * share), MIN_SHARE, rest - MIN_SHARE)
  return { [key]: v, [a]: newA, [b]: rest - newA } as Split
}

/**
 * Moves one of the two dividers on the split bar. Divider 0 sits between
 * carbs and protein, divider 1 between protein and fat; only the two macros
 * touching the divider change.
 */
export function moveDivider(split: Split, divider: 0 | 1, position: number): Split {
  const p = Math.round(position)
  if (divider === 0) {
    const edge = split.carbs + split.protein
    const carbs = clamp(p, MIN_SHARE, edge - MIN_SHARE)
    return { carbs, protein: edge - carbs, fat: split.fat }
  }
  const edge = clamp(p, split.carbs + MIN_SHARE, 100 - MIN_SHARE)
  return { carbs: split.carbs, protein: edge - split.carbs, fat: 100 - edge }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}
