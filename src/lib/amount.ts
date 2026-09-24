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

/**
 * Changing the unit without changing what was meant. Going from 250 gramos to
 * "1 ración" used to keep the 250, which quietly logged 250 helpings; going the
 * other way left 1 gramo.
 *
 * So: to a serving it becomes one of them, to gramos it becomes the grams that
 * amount already weighed, and between two servings the count stays as it is,
 * because both are counts of something.
 */
export function switchUnit(draft: AmountDraft, servings: Serving[], unit: number): AmountDraft {
  if (unit === draft.unit) return draft

  if (unit >= 0) return { text: draft.unit >= 0 ? draft.text : '1', unit }

  const amount = amountFrom(draft, servings)
  const weight = amount?.serving ? amount.quantity * amount.serving.grams : null
  return { text: weight ? inputNum(Math.round(weight)) : draft.text, unit }
}
