import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db'
import { addDays, weekLabel } from '../lib/dates'
import { grams, num } from '../lib/format'
import { categoryLookup, plannedBetween, shoppingList, type ShoppingLine } from '../lib/plan'
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

  const lines = planned && foods ? shoppingList(planned, categoryLookup(foods)) : []
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

  async function copy() {
    const text = lines.map((l) => `- ${l.name}: ${amountText(l)}`).join('\n')
    await navigator.clipboard.writeText(`Lista de la compra (${weekLabel(weekStart)})\n${text}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Sheet
      title="Lista de la compra"
      onClose={onClose}
      footer={
        lines.length > 0 ? (
          <button className="btn ghost block" onClick={copy}>
            {copied ? '✓ Copiada' : 'Copiar la lista'}
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
