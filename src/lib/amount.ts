import type { Amount, Serving } from '../db'
import { inputNum, parseNum } from './format'

export interface AmountDraft {
  text: string
  /** Index into servings, or -1 for grams. */
  unit: number
}

export function draftFrom(amount: Amount | undefined, servings: Serving[]): AmountDraft {
  if (amount) {
    const unit = amount.serving ? servings.findIndex((s) => s.label === amount.serving!.label) : -1
    if (!amount.serving || unit >= 0) return { text: inputNum(amount.quantity), unit }
  }
  return servings.length ? { text: '1', unit: 0 } : { text: '100', unit: -1 }
}

/** Parses a draft into an amount; accepts a comma as decimal separator. Null when invalid. */
export function amountFrom(draft: AmountDraft, servings: Serving[]): Amount | null {
  const quantity = parseNum(draft.text)
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  return draft.unit >= 0 ? { quantity, serving: servings[draft.unit] } : { quantity }
}
