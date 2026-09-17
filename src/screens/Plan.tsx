import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState } from 'react'
import { Chevron } from '../components/Chevron'
import { ImportPlanSheet } from '../components/ImportPlanSheet'
import { PickFoodSheet } from '../components/PickFoodSheet'
import { Sheet } from '../components/Sheet'
import { ShoppingSheet } from '../components/ShoppingSheet'
import { MEALS, MEAL_LABEL, db, type Meal } from '../db'
import { useGoals } from '../hooks'
import { addDays, dayLabel, isoDate, startOfWeek, weekLabel, weekdayName } from '../lib/dates'
import { grams as gramsText, kcal, num } from '../lib/format'
import { clearPlannedWeek, copyPlannedDay, copyPlannedWeek, groupWeek, planFromEaten, planItems, plannedBetween, plannedTotals } from '../lib/plan'

export function Plan() {
  const [start, setStart] = useState(() => startOfWeek(isoDate()))
  const [adding, setAdding] = useState<{ date: string; meal: Meal } | null>(null)
  const [dayMenu, setDayMenu] = useState<string | null>(null)
  const [shopping, setShopping] = useState(false)
  const [importing, setImporting] = useState(false)
  const goals = useGoals()
  const planned = useLiveQuery(() => plannedBetween(start, addDays(start, 6)), [start])

  const closeAdd = useCallback(() => setAdding(null), [])
  const closeMenu = useCallback(() => setDayMenu(null), [])
  const closeShopping = useCallback(() => setShopping(false), [])
  const closeImport = useCallback(() => setImporting(false), [])

  const week = groupWeek(start, planned ?? [])
  const total = plannedTotals(planned ?? [])
  const thisWeek = start === startOfWeek(isoDate())

  return (
    <div className="plan">
      <div className="date-nav">
        <button className="icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label="Semana anterior">
          <Chevron dir="left" />
        </button>
        <div className="date-label static">
          <h1>{thisWeek ? 'Esta semana' : weekLabel(start)}</h1>
          <span className="date-sub muted">{thisWeek ? weekLabel(start) : ''}</span>
        </div>
        <button className="icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label="Semana siguiente">
          <Chevron dir="right" />
        </button>
      </div>

      <div className="day-actions">
        {!thisWeek && (
          <button className="btn ghost small" onClick={() => setStart(startOfWeek(isoDate()))}>
            Esta semana
          </button>
        )}
        <button className="btn ghost small" onClick={() => copyPlannedWeek(addDays(start, -7), start)}>
          Copiar semana anterior
        </button>
        <button className="btn ghost small" onClick={() => setImporting(true)}>
          Importar plan
        </button>
        <button className="btn ghost small" onClick={() => setShopping(true)}>
          Lista de la compra
        </button>
        {(planned?.length ?? 0) > 0 && (
          <button className="btn ghost small" onClick={() => confirm('¿Vaciar el plan de esta semana?') && clearPlannedWeek(start)}>
            Vaciar
          </button>
        )}
      </div>

      {planned && planned.length === 0 && (
        <p className="empty">
          Nada planificado todavía. Añade alimentos a cualquier comida, copia la semana anterior, planifica lo que ya comiste o importa un plan hecho con un asistente.
        </p>
      )}

      <div className="week">
        {week.map(({ date, meals }) => {
          const dayItems = MEALS.flatMap((m) => meals[m])
          const dayKcal = plannedTotals(dayItems).kcal
          return (
            <section className={`card day ${date === isoDate() ? 'today' : ''}`} key={date} aria-label={weekdayName(date)}>
              <header className="day-header">
                <button className="day-title" onClick={() => setDayMenu(date)}>
                  <strong>{weekdayName(date)}</strong>
                  <span className="muted">{Number(date.slice(8))}</span>
                </button>
                {dayItems.length > 0 && (
                  <span className={`day-kcal ${goals.kcal > 0 && dayKcal > goals.kcal * 1.1 ? 'over' : ''}`}>
                    {kcal(dayKcal)} <span className="muted">/ {kcal(goals.kcal)}</span>
                  </span>
                )}
              </header>
              {MEALS.map((meal) => (
                <div className="plan-meal" key={meal}>
                  <div className="plan-meal-head">
                    <span>{MEAL_LABEL[meal]}</span>
                    <button className="icon-btn small" onClick={() => setAdding({ date, meal })} aria-label={`Añadir a ${MEAL_LABEL[meal].toLowerCase()} del ${weekdayName(date).toLowerCase()}`}>
                      +
                    </button>
                  </div>
                  {meals[meal].length > 0 && (
                    <ul className="plan-items">
                      {meals[meal].map((p) => (
                        <li key={p.id}>
                          <span className="plan-name">{p.name}</span>
                          <span className="plan-amount muted">{gramsText(p.grams)}</span>
                          <button className="icon-btn" aria-label={`Quitar ${p.name}`} onClick={() => db.planned.delete(p.id)}>
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          )
        })}
      </div>

      {(planned?.length ?? 0) > 0 && (
        <p className="plan-total muted">
          Semana completa: {kcal(total.kcal)} kcal · {num(total.kcal / 7)} kcal al día de media
        </p>
      )}

      {adding && (
        <PickFoodSheet
          title={`Planificar ${MEAL_LABEL[adding.meal].toLowerCase()} · ${weekdayName(adding.date)}`}
          confirmLabel="Añadir al plan"
          onClose={closeAdd}
          onPick={async (food, amount, grams) => {
            await planItems(
              [{ foodId: food.id, name: food.name, per100: { kcal: food.kcal, carbs: food.carbs, protein: food.protein, fat: food.fat }, grams, amount }],
              adding.date,
              adding.meal,
            )
            setAdding(null)
          }}
        />
      )}

      {dayMenu && <DayMenu date={dayMenu} weekStart={start} onClose={closeMenu} />}
      {shopping && <ShoppingSheet weekStart={start} onClose={closeShopping} />}
      {importing && <ImportPlanSheet weekStart={start} onClose={closeImport} />}
    </div>
  )
}

function DayMenu({ date, weekStart, onClose }: { date: string; weekStart: string; onClose: () => void }) {
  const [copying, setCopying] = useState(false)

  if (copying) {
    return (
      <Sheet title="Copiar a otro día" onClose={onClose}>
        <ul className="repeat-list">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
            .filter((d) => d !== date)
            .map((d) => (
              <li key={d}>
                <button
                  className="repeat-row"
                  onClick={async () => {
                    await copyPlannedDay(date, d)
                    onClose()
                  }}
                >
                  <span className="repeat-name">{weekdayName(d)}</span>
                  <span className="muted">{dayLabel(d)}</span>
                </button>
              </li>
            ))}
        </ul>
      </Sheet>
    )
  }

  return (
    <Sheet title={weekdayName(date)} onClose={onClose}>
      <div className="choose-new">
        <button className="choice-card" onClick={() => setCopying(true)}>
          <strong>Copiar este día a otro</strong>
          <span className="muted">Reemplaza lo planificado en el día que elijas.</span>
        </button>
        <button
          className="choice-card"
          onClick={async () => {
            await planFromEaten(date, date)
            onClose()
          }}
        >
          <strong>Planificar lo que comí este día</strong>
          <span className="muted">Copia al plan lo que ya está registrado ese día.</span>
        </button>
        <button
          className="choice-card"
          onClick={async () => {
            await db.planned.where('date').equals(date).delete()
            onClose()
          }}
        >
          <strong>Vaciar el día</strong>
          <span className="muted">Quita del plan todo lo de este día.</span>
        </button>
      </div>
    </Sheet>
  )
}
