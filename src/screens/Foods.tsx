import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState } from 'react'
import { FoodForm } from '../components/FoodForm'
import { db, type Food } from '../db'
import { kcal, matches, num } from '../lib/format'
import { kcalLooksWrong } from '../lib/nutrition'

export function Foods() {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Food | 'new' | null>(null)
  const foods = useLiveQuery(() => db.foods.orderBy('name').toArray(), [])
  const close = useCallback(() => setEditing(null), [])

  const shown = (foods ?? []).filter((f) => matches(f.name, query))

  async function remove(food: Food) {
    if (!confirm(`Delete “${food.name}”? Days you already logged keep their numbers.`)) return
    await db.foods.delete(food.id)
    setEditing(null)
  }

  return (
    <div className="foods">
      <div className="page-head">
        <h1>Foods</h1>
        <button className="btn primary small" onClick={() => setEditing('new')}>
          + New food
        </button>
      </div>
      <div className="search sticky">
        <input type="search" placeholder={`Search ${foods?.length ?? ''} foods`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search foods" />
      </div>

      {foods && shown.length === 0 && (
        <div className="empty">
          <p>No foods match “{query}”.</p>
          <button className="btn ghost small" onClick={() => setEditing('new')}>
            Create it
          </button>
        </div>
      )}

      <ul className="food-list card">
        {shown.map((f) => (
          <li key={f.id}>
            <button className="food-row" onClick={() => setEditing(f)}>
              <span className="food-name">
                {f.name}
                {kcalLooksWrong(f) && (
                  <span className="badge warn" title="kcal don't match the macros">
                    check
                  </span>
                )}
              </span>
              <span className="food-meta">
                {kcal(f.kcal)} kcal · C {num(f.carbs)} · P {num(f.protein)} · F {num(f.fat)}
                {f.servings.length > 0 && <span className="muted"> · {f.servings.map((s) => s.label).join(', ')}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {editing === 'new' && <FoodForm onClose={close} />}
      {editing && editing !== 'new' && <FoodForm food={editing} onClose={close} onDelete={() => remove(editing)} />}
    </div>
  )
}
