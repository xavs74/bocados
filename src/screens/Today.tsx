import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState } from 'react'
import { AddEntrySheet } from '../components/AddEntrySheet'
import { CalendarSheet } from '../components/CalendarSheet'
import { CalendarIcon, Chevron } from '../components/Chevron'
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
  const [calendarOpen, setCalendarOpen] = useState(false)
  const goals = useGoals()
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).sortBy('createdAt'), [date])

  const closeAdd = useCallback(() => setAdding(null), [])
  const closeEdit = useCallback(() => setEditing(null), [])
  const closeCalendar = useCallback(() => setCalendarOpen(false), [])

  const list = entries ?? []
  const totals = sum(list.map((e) => scale(e.per100, e.grams)))
  const isToday = date === isoDate()

  return (
    <div className="today">
      <div className="date-nav">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">
          <Chevron dir="left" />
        </button>
        <button className="date-label" onClick={() => setCalendarOpen(true)} aria-label={`${fullDate(date)}. Abrir calendario`}>
          <h1>{dayLabel(date)}</h1>
          <span className="date-sub">
            <CalendarIcon />
            {fullDate(date)}
          </span>
        </button>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Día siguiente">
          <Chevron dir="right" />
        </button>
      </div>
      {!isToday && (
        <button className="btn ghost small back-today" onClick={() => setDate(isoDate())}>
          Volver a hoy
        </button>
      )}

      <div className="today-grid">
        <div className="today-summary">
          <Summary totals={totals} goals={goals} isPast={date < isoDate()} />
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
                                Carb {num(n.carbs)} · Prot {num(n.protein)} · Grasa {num(n.fat)}
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <button className="add-btn" onClick={() => setAdding(meal)}>
                  <span aria-hidden="true">+</span> Añadir alimento
                </button>
              </section>
            )
          })}
        </div>
      </div>

      <button className="fab" onClick={() => setAdding(isToday ? mealForNow() : 'lunch')} aria-label="Añadir alimento">
        +
      </button>

      {adding && <AddEntrySheet date={date} meal={adding} onClose={closeAdd} />}
      {editing && <EditEntrySheet entry={editing} onClose={closeEdit} />}
      {calendarOpen && <CalendarSheet date={date} onPick={setDate} onClose={closeCalendar} />}
    </div>
  )
}

function amountText(e: Entry) {
  const s = e.amount.serving
  if (!s) return grams(e.grams)
  return `${num(e.amount.quantity)} × ${s.label.replace(/^1\s+/, '')} · ${grams(e.grams)}`
}
