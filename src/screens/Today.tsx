import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState } from 'react'
import { AddEntrySheet } from '../components/AddEntrySheet'
import { EditEntrySheet } from '../components/EditEntrySheet'
import { Summary } from '../components/Summary'
import { MEALS, MEAL_LABEL, db, type Entry, type Meal } from '../db'
import { useGoals } from '../hooks'
import { addDays, dayLabel, fullDate, isoDate } from '../lib/dates'
import { mealForNow } from '../lib/meals'
import { grams, kcal, num } from '../lib/format'
import { scale, sum } from '../lib/nutrition'

export function Today() {
  const [date, setDate] = useState(isoDate)
  const [adding, setAdding] = useState<Meal | null>(null)
  const [editing, setEditing] = useState<Entry | null>(null)
  const goals = useGoals()
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).sortBy('createdAt'), [date])

  const closeAdd = useCallback(() => setAdding(null), [])
  const closeEdit = useCallback(() => setEditing(null), [])

  const list = entries ?? []
  const totals = sum(list.map((e) => scale(e.per100, e.grams)))
  const isToday = date === isoDate()

  return (
    <div className="today">
      <div className="date-nav">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          <Chevron dir="left" />
        </button>
        <div className="date-label">
          <h1>{dayLabel(date)}</h1>
          <span className="muted">{fullDate(date)}</span>
        </div>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">
          <Chevron dir="right" />
        </button>
      </div>
      {!isToday && (
        <button className="btn ghost small back-today" onClick={() => setDate(isoDate())}>
          Back to today
        </button>
      )}

      <div className="today-grid">
        <div className="today-summary">
          <Summary totals={totals} goals={goals} />
        </div>

        <div className="meals">
          {MEALS.map((meal) => {
            const items = list.filter((e) => e.meal === meal)
            const mealKcal = sum(items.map((e) => scale(e.per100, e.grams))).kcal
            return (
              <section className="card meal" key={meal} aria-labelledby={`meal-${meal}`}>
                <header className="meal-header">
                  <h2 id={`meal-${meal}`}>{MEAL_LABEL[meal]}</h2>
                  {items.length > 0 && <span className="meal-kcal">{kcal(mealKcal)} kcal</span>}
                </header>
                {items.length > 0 && (
                  <ul className="entries">
                    {items.map((e) => {
                      const n = scale(e.per100, e.grams)
                      return (
                        <li key={e.id}>
                          <button className="entry" onClick={() => setEditing(e)}>
                            <span className="entry-main">
                              <span className="entry-name">{e.name}</span>
                              <span className="entry-amount muted">{amountText(e)}</span>
                            </span>
                            <span className="entry-side">
                              <span className="entry-kcal">{kcal(n.kcal)}</span>
                              <span className="entry-macros muted">
                                C {num(n.carbs)} · P {num(n.protein)} · F {num(n.fat)}
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <button className="add-btn" onClick={() => setAdding(meal)}>
                  <span aria-hidden="true">+</span> Add food
                </button>
              </section>
            )
          })}
        </div>
      </div>

      <button className="fab" onClick={() => setAdding(isToday ? mealForNow() : 'lunch')} aria-label="Add food">
        +
      </button>

      {adding && <AddEntrySheet date={date} meal={adding} onClose={closeAdd} />}
      {editing && <EditEntrySheet entry={editing} onClose={closeEdit} />}
    </div>
  )
}

function amountText(e: Entry) {
  const s = e.amount.serving
  if (!s) return grams(e.grams)
  return `${num(e.amount.quantity)} × ${s.label.replace(/^1\s+/, '')} · ${grams(e.grams)}`
}

export function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M13.5 5l-6 6 6 6' : 'M8.5 5l6 6-6 6'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
