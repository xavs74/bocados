import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, useState } from 'react'
import { FoodForm } from '../components/FoodForm'
import { db, type Food } from '../db'
import { addMissingBasicFoods, missingBasicFoods } from '../lib/basicFoods'
import { categoryOf, groupByCategory } from '../lib/categories'
import { kcal, matches, num } from '../lib/format'
import { kcalLooksWrong } from '../lib/nutrition'

export function Foods() {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Food | 'new' | null>(null)
  // null when not selecting; otherwise the ids picked for deletion.
  const [selected, setSelected] = useState<Set<number> | null>(null)
  const foods = useLiveQuery(() => db.foods.orderBy('name').toArray(), [])
  const close = useCallback(() => setEditing(null), [])

  const searching = query.trim() !== ''
  const shown = useMemo(() => (foods ?? []).filter((f) => matches(f.name, query)), [foods, query])
  const groups = useMemo(() => groupByCategory(shown), [shown])
  const missing = useMemo(() => (foods ? missingBasicFoods(foods).length : 0), [foods])

  async function remove(food: Food) {
    if (!confirm(`¿Borrar «${food.name}»? Los días ya registrados conservan sus datos.`)) return
    await db.foods.delete(food.id)
    setEditing(null)
  }

  async function removeSelected() {
    if (!selected?.size) return
    const n = selected.size
    if (!confirm(`¿Borrar ${n} ${n === 1 ? 'alimento' : 'alimentos'}? Los días ya registrados conservan sus datos.`)) return
    await db.foods.bulkDelete([...selected])
    setSelected(null)
  }

  function toggle(id: number) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const allShownSelected = !!selected && shown.length > 0 && shown.every((f) => selected.has(f.id))

  function toggleAllShown() {
    const next = new Set(selected)
    for (const f of shown) {
      if (allShownSelected) next.delete(f.id)
      else next.add(f.id)
    }
    setSelected(next)
  }

  const basicBanner = missing > 0 && !selected && !searching && (
    <BasicFoodsBanner missing={missing} total={foods?.length ?? 0} />
  )

  return (
    <div className={`foods ${selected ? 'selecting' : ''}`}>
      <div className="page-head">
        <h1>Alimentos</h1>
        <div className="head-actions">
          {selected ? (
            <button className="btn ghost small" onClick={() => setSelected(null)}>
              Cancelar
            </button>
          ) : (
            <>
              <button className="btn ghost small" onClick={() => setSelected(new Set())} disabled={!foods?.length}>
                Seleccionar
              </button>
              <button className="btn primary small" onClick={() => setEditing('new')}>
                + Nuevo
              </button>
            </>
          )}
        </div>
      </div>
      <div className="search sticky">
        <input
          type="search"
          placeholder={`Buscar entre ${foods?.length ?? ''} alimentos`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar alimento"
        />
      </div>

      {/* Devices that started with the old personal list see this first; everyone else at the end. */}
      {missing >= 20 && basicBanner}

      {foods && shown.length === 0 && (
        <div className="empty">
          <p>{searching ? `Ningún alimento coincide con «${query}».` : 'Todavía no hay alimentos.'}</p>
          {!selected && (
            <button className="btn ghost small" onClick={() => setEditing('new')}>
              Crear uno
            </button>
          )}
        </div>
      )}

      {searching ? (
        shown.length > 0 && <FoodList foods={shown} selected={selected} showCategory onToggle={toggle} onOpen={setEditing} />
      ) : (
        groups.map((g) => (
          <section key={g.category} className="food-group" aria-label={g.category}>
            <h2 className="group-title">
              {g.category} <span className="muted">· {g.foods.length}</span>
            </h2>
            <FoodList foods={g.foods} selected={selected} onToggle={toggle} onOpen={setEditing} />
          </section>
        ))
      )}

      {missing > 0 && missing < 20 && basicBanner}

      {selected && (
        <div className="selection-bar" role="toolbar" aria-label="Acciones de selección">
          <button className="btn ghost small" onClick={toggleAllShown} disabled={shown.length === 0}>
            {allShownSelected ? 'Ninguno' : 'Todos'}
          </button>
          <span className="selection-count">
            {selected.size} {selected.size === 1 ? 'seleccionado' : 'seleccionados'}
          </span>
          <button className="btn danger-solid small" onClick={removeSelected} disabled={selected.size === 0}>
            Borrar
          </button>
        </div>
      )}

      {editing === 'new' && <FoodForm initialName={query.trim()} onClose={close} />}
      {editing && editing !== 'new' && <FoodForm food={editing} onClose={close} onDelete={() => remove(editing)} />}
    </div>
  )
}

interface ListProps {
  foods: Food[]
  selected: Set<number> | null
  showCategory?: boolean
  onToggle: (id: number) => void
  onOpen: (food: Food) => void
}

function FoodList({ foods, selected, showCategory, onToggle, onOpen }: ListProps) {
  return (
    <ul className="food-list card">
      {foods.map((f) => {
        const checked = !!selected?.has(f.id)
        return (
          <li key={f.id} className={checked ? 'checked' : ''}>
            <button
              className="food-row with-text"
              onClick={() => (selected ? onToggle(f.id) : onOpen(f))}
              role={selected ? 'checkbox' : undefined}
              aria-checked={selected ? checked : undefined}
            >
              {selected && <span className="check" aria-hidden="true" />}
              <span className="food-text">
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
                  {showCategory && <span className="muted"> · {categoryOf(f)}</span>}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function BasicFoodsBanner({ missing, total }: { missing: number; total: number }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="card pad basic-banner">
      <div>
        <strong>Lista básica de alimentos</strong>
        <p className="hint">
          {total === 0
            ? `Añade ${missing} alimentos comunes con valores nutricionales medios.`
            : `Faltan ${missing} alimentos comunes (frutas, carnes, lácteos…) con valores medios. Los tuyos no se tocan.`}
        </p>
      </div>
      <button
        className="btn primary small"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await addMissingBasicFoods()
          setBusy(false)
        }}
      >
        Añadir {missing}
      </button>
    </div>
  )
}
