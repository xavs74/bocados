import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { AddEntryPanel, AddEntrySheet } from '../components/AddEntry'
import { CalendarMonth, CalendarSheet } from '../components/CalendarSheet'
import { CalendarIcon, Chevron } from '../components/Chevron'
import { EditEntrySheet } from '../components/EditEntrySheet'
import { RepeatSheet } from '../components/RepeatSheet'
import { MacroCols, MacroColsHead } from '../components/MacroCols'
import { Summary } from '../components/Summary'
import { MEALS, MEAL_LABEL, db, type Entry, type Meal } from '../db'
import { useGoals } from '../hooks'
import { addDays, dayLabel, fullDate, isoDate } from '../lib/dates'
import { grams, kcal, num } from '../lib/format'
import { mealForNow } from '../lib/meals'
import { scale, sum } from '../lib/nutrition'
import { useIsLaptop } from '../lib/useMediaQuery'

export function Today() {
  const laptop = useIsLaptop()
  const [date, setDate] = useState(isoDate)
  const [adding, setAdding] = useState<Meal | null>(null)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  // A meal to repeat, 'day' for the whole day, or null when the sheet is closed.
  const [repeating, setRepeating] = useState<Meal | 'day' | null>(null)
  // Laptop: the docked add panel's meal, and a counter that refocuses its search.
  const [panelMeal, setPanelMeal] = useState<Meal>(mealForNow)
  const [panelFocus, setPanelFocus] = useState(0)
  const goals = useGoals()
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).sortBy('createdAt'), [date])

  const closeAdd = useCallback(() => setAdding(null), [])
  const closeEdit = useCallback(() => setEditing(null), [])
  const closeCalendar = useCallback(() => setCalendarOpen(false), [])
  const closeRepeat = useCallback(() => setRepeating(null), [])

  const list = entries ?? []
  const totals = sum(list.map((e) => scale(e.per100, e.grams)))
  const isToday = date === isoDate()

  function startAdding(meal: Meal) {
    if (laptop) {
      setPanelMeal(meal)
      setPanelFocus((n) => n + 1)
    } else {
      setAdding(meal)
    }
  }

  // Laptop shortcuts: ← and → change day, / jumps to the food search.
  useEffect(() => {
    if (!laptop) return
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, select, textarea, [contenteditable]')
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.sheet-backdrop')) return
      if (e.key === 'ArrowLeft') setDate((d) => addDays(d, -1))
      else if (e.key === 'ArrowRight') setDate((d) => addDays(d, 1))
      else if (e.key === '/') {
        e.preventDefault()
        setPanelFocus((n) => n + 1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [laptop])

  const dateTitle = (
    <>
      <h1>{dayLabel(date)}</h1>
      <span className="date-sub">
        {!laptop && <CalendarIcon />}
        {fullDate(date)}
      </span>
    </>
  )

  return (
    <div className="today">
      <div className="date-nav">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior" title={laptop ? 'Día anterior (←)' : undefined}>
          <Chevron dir="left" />
        </button>
        {laptop ? (
          <div className="date-label static">{dateTitle}</div>
        ) : (
          <button className="date-label" onClick={() => setCalendarOpen(true)} aria-label={`${fullDate(date)}. Abrir calendario`}>
            {dateTitle}
          </button>
        )}
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label="Día siguiente" title={laptop ? 'Día siguiente (→)' : undefined}>
          <Chevron dir="right" />
        </button>
        {laptop && !isToday && (
          <button className="btn ghost small" onClick={() => setDate(isoDate())}>
            Volver a hoy
          </button>
        )}
      </div>
      <div className="day-actions">
        {!laptop && !isToday && (
          <button className="btn ghost small" onClick={() => setDate(isoDate())}>
            Volver a hoy
          </button>
        )}
        <button className="btn ghost small" onClick={() => setRepeating('day')}>
          <RepeatIcon /> Repetir un día
        </button>
      </div>

      <div className="today-grid">
        <div className="today-summary">
          <Summary totals={totals} goals={goals} isPast={date < isoDate()} />
          {laptop && (
            <section className="card pad" aria-label="Calendario">
              <CalendarMonth key={date.slice(0, 7)} date={date} onPick={setDate} />
            </section>
          )}
        </div>

        <div className="meals">
          {MEALS.map((meal) => {
            const items = list.filter((e) => e.meal === meal)
            const mealTotals = sum(items.map((e) => scale(e.per100, e.grams)))
            return (
              <section className={`card meal ${laptop && panelMeal === meal ? 'targeted' : ''}`} key={meal} aria-labelledby={`meal-${meal}`}>
                <header className="meal-header">
                  <h2 id={`meal-${meal}`}>{MEAL_LABEL[meal]}</h2>
                  {laptop ? (
                    items.length > 0 && <MacroCols n={mealTotals} strong />
                  ) : (
                    items.length > 0 && <span className="meal-kcal">{kcal(mealTotals.kcal)} kcal</span>
                  )}
                </header>
                {laptop && items.length > 0 && (
                  <div className="entry-head" aria-hidden="true">
                    <span>Alimento</span>
                    <MacroColsHead />
                  </div>
                )}
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
                            {laptop ? (
                              <MacroCols n={n} />
                            ) : (
                              <span className="entry-side">
                                <span className="entry-kcal">{kcal(n.kcal)}</span>
                                <span className="entry-macros muted">
                                  Carb {num(n.carbs)} · Prot {num(n.protein)} · Grasa {num(n.fat)}
                                </span>
                              </span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <div className="meal-actions">
                  <button className="add-btn" onClick={() => startAdding(meal)}>
                    <span aria-hidden="true">+</span> Añadir alimento
                  </button>
                  <button className="add-btn secondary" onClick={() => setRepeating(meal)}>
                    <RepeatIcon /> Repetir
                  </button>
                </div>
              </section>
            )
          })}
        </div>

        {laptop && (
          <div className="today-panel">
            <AddEntryPanel date={date} meal={panelMeal} onMealChange={setPanelMeal} focusKey={panelFocus} />
            <p className="shortcuts muted">
              <span>
                <kbd>/</kbd> buscar
              </span>
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> elegir
              </span>
              <span>
                <kbd>Enter</kbd> añadir
              </span>
              <span>
                <kbd>Esc</kbd> atrás
              </span>
              <span>
                <kbd>←</kbd>
                <kbd>→</kbd> cambiar de día
              </span>
            </p>
          </div>
        )}
      </div>

      {!laptop && (
        <button className="fab" onClick={() => setAdding(isToday ? mealForNow() : 'lunch')} aria-label="Añadir alimento">
          +
        </button>
      )}

      {adding && <AddEntrySheet date={date} meal={adding} onClose={closeAdd} />}
      {editing && <EditEntrySheet entry={editing} onClose={closeEdit} />}
      {calendarOpen && <CalendarSheet date={date} onPick={setDate} onClose={closeCalendar} />}
      {repeating && (
        <RepeatSheet
          date={date}
          meal={repeating === 'day' ? undefined : repeating}
          current={repeating === 'day' ? [] : list.filter((e) => e.meal === repeating)}
          onClose={closeRepeat}
        />
      )}
    </div>
  )
}


function RepeatIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5" />
    </svg>
  )
}

function amountText(e: Entry) {
  const s = e.amount.serving
  if (!s) return grams(e.grams)
  return `${num(e.amount.quantity)} × ${s.label.replace(/^1\s+/, '')} · ${grams(e.grams)}`
}
