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
    if (!confirm(`¿Borrar «${food.name}»? Los días ya registrados conservan sus datos.`)) return
    await db.foods.delete(food.id)
    setEditing(null)
  }

  return (
    <div className="foods">
      <div className="page-head">
        <h1>Alimentos</h1>
        <button className="btn primary small" onClick={() => setEditing('new')}>
          + Nuevo
        </button>
      </div>
      <div className="search sticky">
        <input type="search" placeholder={`Buscar entre ${foods?.length ?? ''} alimentos`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar alimento" />
      </div>

      {foods && shown.length === 0 && (
        <div className="empty">
          <p>Ningún alimento coincide con «{query}».</p>
          <button className="btn ghost small" onClick={() => setEditing('new')}>
            Crearlo
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
                  <span className="badge warn" title="Las kcal no cuadran con los macros">
                    revisar
                  </span>
                )}
              </span>
              <span className="food-meta">
                {kcal(f.kcal)} kcal · Carb {num(f.carbs)} · Prot {num(f.protein)} · Grasa {num(f.fat)}
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
