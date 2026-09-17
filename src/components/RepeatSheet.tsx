import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { MEAL_LABEL, db, type Entry, type Meal, type MealSet } from '../db'
import { dayLabel } from '../lib/dates'
import { kcal } from '../lib/format'
import { copyDay, describeItems, itemsFromEntries, logItems, logMealSet, recentDays, recentMeals, saveMealSet, totalsOf } from '../lib/mealSets'
import { scale, sum } from '../lib/nutrition'
import { Sheet } from './Sheet'

interface Props {
  date: string
  /** A meal to repeat, or undefined to repeat a whole day. */
  meal?: Meal
  /** What's already logged for that meal today, offered for saving. */
  current: Entry[]
  onClose: () => void
}

export function RepeatSheet({ date, meal, current, onClose }: Props) {
  const sets = useLiveQuery(() => db.mealSets.toArray(), [])
  const past = useLiveQuery(() => (meal ? recentMeals(meal, date) : Promise.resolve([])), [meal, date])
  const days = useLiveQuery(() => (meal ? Promise.resolve([]) : recentDays(date)), [meal, date])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const title = meal ? `Repetir ${MEAL_LABEL[meal].toLowerCase()}` : 'Repetir un día'
  const ordered = (sets ?? []).sort((a, b) => (b.lastUsed ?? b.createdAt) - (a.lastUsed ?? a.createdAt))

  async function save() {
    if (!name.trim() || !current.length) return
    await saveMealSet(name, itemsFromEntries(current))
    setNaming(false)
    setName('')
  }

  async function remove(set: MealSet) {
    if (!confirm(`¿Borrar la comida guardada «${set.name}»? Los días ya registrados no cambian.`)) return
    await db.mealSets.delete(set.id)
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="repeat">
        {meal && current.length > 0 && (
          <section>
            {naming ? (
              <form
                className="save-set"
                onSubmit={(e) => {
                  e.preventDefault()
                  save()
                }}
              >
                <label className="field">
                  <span>Nombre de la comida</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Desayuno de siempre" autoFocus />
                </label>
                <div className="footer-row">
                  <button type="button" className="btn ghost" onClick={() => setNaming(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn primary grow" disabled={!name.trim()}>
                    Guardar
                  </button>
                </div>
              </form>
            ) : (
              <button className="btn ghost block wrap" onClick={() => setNaming(true)}>
                + Guardar estos alimentos como comida
              </button>
            )}
          </section>
        )}

        {meal && (
          <section>
            <h3 className="group-title">Comidas guardadas</h3>
            {ordered.length === 0 ? (
              <p className="empty">
                Todavía no tienes ninguna. Guarda una comida y podrás añadirla entera en un toque.
              </p>
            ) : (
              <ul className="repeat-list">
                {ordered.map((set) => (
                  <li key={set.id}>
                    <button
                      className="repeat-row"
                      onClick={async () => {
                        await logMealSet(set, date, meal)
                        onClose()
                      }}
                    >
                      <span className="repeat-main">
                        <span className="repeat-name">{set.name}</span>
                        <span className="repeat-items muted">{describeItems(set.items)}</span>
                      </span>
                      <span className="repeat-kcal">{kcal(totalsOf(set.items).kcal)} kcal</span>
                    </button>
                    <button className="icon-btn" aria-label={`Borrar ${set.name}`} onClick={() => remove(set)}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section>
          <h3 className="group-title">{meal ? 'Días anteriores' : 'Copiar un día entero'}</h3>
          {meal ? (
            past === undefined ? null : past.length === 0 ? (
              <p className="empty">No hay ningún {MEAL_LABEL[meal].toLowerCase()} anterior que repetir.</p>
            ) : (
              <ul className="repeat-list">
                {past.map((p) => (
                  <li key={p.date}>
                    <button
                      className="repeat-row"
                      onClick={async () => {
                        await logItems(p.items, date, meal)
                        onClose()
                      }}
                    >
                      <span className="repeat-main">
                        <span className="repeat-name">{dayLabel(p.date)}</span>
                        <span className="repeat-items muted">{describeItems(p.items)}</span>
                      </span>
                      <span className="repeat-kcal">{kcal(totalsOf(p.items).kcal)} kcal</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : days === undefined ? null : days.length === 0 ? (
            <p className="empty">No hay días anteriores con comidas registradas.</p>
          ) : (
            <ul className="repeat-list">
              {days.map((d) => (
                <li key={d.date}>
                  <button
                    className="repeat-row"
                    onClick={async () => {
                      await copyDay(d.date, date)
                      onClose()
                    }}
                  >
                    <span className="repeat-main">
                      <span className="repeat-name">{dayLabel(d.date)}</span>
                      <span className="repeat-items muted">
                        {d.entries.length} {d.entries.length === 1 ? 'alimento' : 'alimentos'}
                      </span>
                    </span>
                    <span className="repeat-kcal">{kcal(sum(d.entries.map((e) => scale(e.per100, e.grams))).kcal)} kcal</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Sheet>
  )
}
