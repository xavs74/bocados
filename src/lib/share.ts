import { MEAL_LABEL, type Amount, type Meal, type Planned } from '../db'
import { fullDate } from './dates'
import { grams, kcal, num } from './format'
import { plannedTotals } from './plan'

export type ShareResult = 'shared' | 'copied' | 'cancelled'

/** Phones (and Safari) have a share menu: WhatsApp, Notas, Mensajes… */
export const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

/**
 * Opens the system share menu with the text, or copies it where there's no
 * share menu (most laptop browsers).
 */
export async function shareText(title: string, text: string): Promise<ShareResult> {
  // WhatsApp drops the share title, so the heading goes in the text too.
  const full = `*${title}*\n\n${text}`
  if (canShare()) {
    try {
      await navigator.share({ text: full })
      return 'shared'
    } catch (e) {
      // Closing the menu without choosing an app isn't an error worth showing.
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(full)
  return 'copied'
}

/** "250 g", or "2 × trozo · 80 g" for foods logged in servings. */
export function amountText(amount: Amount, totalGrams: number): string {
  const g = grams(totalGrams)
  if (!amount.serving) return g
  return `${num(amount.quantity)} × ${amount.serving.label.replace(/^1\s+/, '')} · ${g}`
}

/**
 * A plan written out for a message: each day, its meals in order, each food
 * with its amount, and the day's calories.
 */
export function planText(days: { date: string; meals: Record<Meal, Planned[]> }[], meals: readonly Meal[]): string {
  return days
    .map(({ date, meals: byMeal }) => {
      const items = meals.flatMap((m) => byMeal[m])
      if (items.length === 0) return null
      const lines = [`*${fullDate(date)}* · ${kcal(plannedTotals(items).kcal)} kcal`]
      for (const meal of meals) {
        if (byMeal[meal].length === 0) continue
        lines.push(`${MEAL_LABEL[meal]}:`)
        for (const p of byMeal[meal]) lines.push(`- ${p.name}: ${amountText(p.amount, p.grams)}`)
      }
      return lines.join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}
