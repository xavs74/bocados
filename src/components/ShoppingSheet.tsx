import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db'
import { addDays, weekLabel } from '../lib/dates'
import { grams, num } from '../lib/format'
import { canShare, shareText } from '../lib/share'
import { categoryLookup, expandRecipes, plannedBetween, shoppingList, type ShoppingLine } from '../lib/plan'
import { Sheet } from './Sheet'

/** Grams read better as kilos once they pass a kilo. */
const amountText = (line: ShoppingLine) => {
  const weight = line.grams >= 1000 ? `${num(line.grams / 1000)} kg` : grams(line.grams)
  return line.servings ? `${num(line.servings.count)} × ${line.servings.label.replace(/^1\s+/, '')} · ${weight}` : weight
}

export function ShoppingSheet({ weekStart, onClose }: { weekStart: string; onClose: () => void }) {
  const [bought, setBought] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const planned = useLiveQuery(() => plannedBetween(weekStart, addDays(weekStart, 6)), [weekStart])
  const foods = useLiveQuery(() => db.foods.toArray(), [])
  const recipes = useLiveQuery(() => db.recipes.toArray(), [])

  const byFood = new Map((recipes ?? []).filter((r) => r.foodId).map((r) => [r.foodId!, r]))
  const lines = planned && foods && recipes ? shoppingList(expandRecipes(planned, (id) => byFood.get(id)), categoryLookup(foods)) : []
  const groups = lines.reduce<Record<string, ShoppingLine[]>>((acc, line) => {
    ;(acc[line.category] ??= []).push(line)
    return acc
  }, {})

  function toggle(name: string) {
    const next = new Set(bought)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setBought(next)
  }

  // What's already ticked off is in the basket: whoever gets the list doesn't need it.
  const toBuy = lines.filter((l) => !bought.has(l.name))

  async function share() {
    const text = toBuy.map((l) => `- ${l.name}: ${amountText(l)}`).join('\n')
    if ((await shareText(`Lista de la compra (${weekLabel(weekStart)})`, text)) !== 'copied') return
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Sheet
      title="Lista de la compra"
      onClose={onClose}
      footer={
        lines.length > 0 ? (
          <button className="btn primary block" onClick={share} disabled={toBuy.length === 0}>
            {copied ? (
              '✓ Copiada'
            ) : (
              <>
                <ShareIcon /> {canShare() ? 'Compartir la lista' : 'Copiar la lista'}
              </>
            )}
          </button>
        ) : undefined
      }
    >
      <div className="shopping">
        <p className="hint">
          {weekLabel(weekStart)} · {lines.length} {lines.length === 1 ? 'alimento' : 'alimentos'}. Lo que ya has comido sale del plan y no aparece aquí.
        </p>
        {planned && lines.length === 0 && <p className="empty">No hay nada planificado esta semana.</p>}
        {Object.entries(groups).map(([category, items]) => (
          <section key={category}>
            <h3 className="group-title">{category}</h3>
            <ul className="shopping-list">
              {items.map((line) => (
                <li key={line.name} className={bought.has(line.name) ? 'bought' : ''}>
                  <button onClick={() => toggle(line.name)} role="checkbox" aria-checked={bought.has(line.name)}>
                    <span className="check" aria-hidden="true" />
                    <span className="shopping-name">{line.name}</span>
                    <span className="shopping-amount muted">{amountText(line)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  )
}

export function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  )
}
