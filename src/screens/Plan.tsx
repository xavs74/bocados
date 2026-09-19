import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState } from 'react'
import { Chevron } from '../components/Chevron'
import { ImportPlanSheet } from '../components/ImportPlanSheet'
import { PickFoodSheet } from '../components/PickFoodSheet'
import { Sheet } from '../components/Sheet'
import { ShareIcon, ShoppingSheet } from '../components/ShoppingSheet'
import { MEALS, MEAL_LABEL, db, type Meal, type Planned } from '../db'
import { useGoals, useMeals } from '../hooks'
import { visibleMeals } from '../lib/meals'
import { dayStatus, wellOver } from '../lib/calendar'
import { askConfirm } from '../lib/confirm'
import { canShare, planText, shareText } from '../lib/share'
import { addDays, dayLabel, isoDate, parseIso, startOfWeek, weekLabel, weekdayName } from '../lib/dates'
import { grams as gramsText, kcal, num } from '../lib/format'
import { MACROS, MACRO_LABEL, MACRO_SHORT, goalGrams, scale, type Goals } from '../lib/nutrition'
import { clearPlannedWeek, copyPlannedDay, copyPlannedWeek, groupWeek, planFromEaten, planItems, plannedBetween, plannedTotals } from '../lib/plan'

export function Plan() {
  const today = isoDate()
  const [start, setStart] = useState(() => startOfWeek(today))
  // The day shown in full; the strip above picks it.
  const [selected, setSelected] = useState(today)
  const [adding, setAdding] = useState<Meal | null>(null)
  const [sheet, setSheet] = useState<'more' | 'day' | 'shopping' | 'import' | null>(null)
  const goals = useGoals()
  const enabledMeals = useMeals()
  const planned = useLiveQuery(() => plannedBetween(start, addDays(start, 6)), [start])

  const close = useCallback(() => setSheet(null), [])
  const closeAdd = useCallback(() => setAdding(null), [])

  const week = groupWeek(start, planned ?? [])
  const thisWeek = start === startOfWeek(today)
  const day = week.find((d) => d.date === selected) ?? week[0]
  const dayItems = MEALS.flatMap((m) => day.meals[m])

  function goToWeek(weekStart: string) {
    setStart(weekStart)
    setSelected(weekStart === startOfWeek(today) ? today : weekStart)
  }

  return (
    <div className="plan">
      <header className="plan-head">
        <button className="icon-btn" onClick={() => goToWeek(addDays(start, -7))} aria-label="Semana anterior">
          <Chevron dir="left" />
        </button>
        <div className="plan-title">
          <h1>{thisWeek ? 'Esta semana' : weekLabel(start)}</h1>
          {thisWeek ? (
            <span className="muted">{weekLabel(start)}</span>
          ) : (
            <button className="link-btn" onClick={() => goToWeek(startOfWeek(today))}>
              Volver a esta semana
            </button>
          )}
        </div>
        <button className="icon-btn" onClick={() => goToWeek(addDays(start, 7))} aria-label="Semana siguiente">
          <Chevron dir="right" />
        </button>
      </header>

      <div className="plan-actions">
        <button className="btn primary" onClick={() => setSheet('import')}>
          <SparkIcon /> Importar plan
        </button>
        <button className="btn ghost" onClick={() => setSheet('shopping')}>
          <CartIcon /> Lista de la compra
        </button>
        <button className="icon-btn more-btn" onClick={() => setSheet('more')} aria-label="Más opciones de la semana">
          <MoreIcon />
        </button>
      </div>

      <WeekStrip week={week} selected={day.date} today={today} goal={goals.kcal} onSelect={setSelected} />

      <div className="plan-day">
        <DaySummary items={dayItems} goals={goals} date={day.date} onMenu={() => setSheet('day')} />
        <div className="plan-meals">
          {visibleMeals(enabledMeals, dayItems.map((p) => p.meal)).map((meal) => (
            <MealCard key={meal} meal={meal} items={day.meals[meal]} onAdd={() => setAdding(meal)} />
          ))}
        </div>
      </div>

      {adding && (
        <PickFoodSheet
          title={`Planificar ${MEAL_LABEL[adding].toLowerCase()} · ${weekdayName(day.date)}`}
          confirmLabel="Añadir al plan"
          onClose={closeAdd}
          onPick={async (food, amount, grams) => {
            await planItems(
              [{ foodId: food.id, name: food.name, per100: { kcal: food.kcal, carbs: food.carbs, protein: food.protein, fat: food.fat }, grams, amount }],
              day.date,
              adding,
            )
            setAdding(null)
          }}
        />
      )}

      {sheet === 'more' && (
        <Sheet title="Opciones de la semana" onClose={close}>
          <div className="choose-new">
            <button
              className="choice-card"
              disabled={!planned?.length}
              onClick={async () => {
                setSheet(null)
                await shareText(`Plan de la semana (${weekLabel(start)})`, planText(week, enabledMeals))
              }}
            >
              <strong>
                <ShareIcon /> {canShare() ? 'Compartir el plan de la semana' : 'Copiar el plan de la semana'}
              </strong>
              <span className="muted">Por WhatsApp, por ejemplo, para quien cocina o hace la compra.</span>
            </button>
            <button
              className="choice-card"
              onClick={async () => {
                setSheet(null)
                if (await askConfirm('Se reemplaza lo planificado esta semana por la semana anterior.', { title: '¿Copiar la semana anterior?', confirmLabel: 'Copiar' }))
                  await copyPlannedWeek(addDays(start, -7), start)
              }}
            >
              <strong>Copiar la semana anterior</strong>
              <span className="muted">Repite el plan de la semana pasada en esta.</span>
            </button>
            <button
              className="choice-card danger"
              disabled={!planned?.length}
              onClick={async () => {
                setSheet(null)
                if (await askConfirm('Se quita todo lo planificado de esta semana. Lo que ya has comido no cambia.', { title: '¿Vaciar la semana?', confirmLabel: 'Vaciar', danger: true }))
                  await clearPlannedWeek(start)
              }}
            >
              <strong>Vaciar la semana</strong>
              <span className="muted">Quita todo lo planificado de estos siete días.</span>
            </button>
          </div>
        </Sheet>
      )}
      {sheet === 'day' && <DayMenu date={day.date} weekStart={start} text={planText([day], enabledMeals)} onClose={close} />}
      {sheet === 'shopping' && <ShoppingSheet weekStart={start} onClose={close} />}
      {sheet === 'import' && <ImportPlanSheet weekStart={start} onClose={close} />}
    </div>
  )
}

/** Seven days at a glance: planned kcal and how close each is to the goal. */
function WeekStrip({ week, selected, today, goal, onSelect }: { week: ReturnType<typeof groupWeek>; selected: string; today: string; goal: number; onSelect: (d: string) => void }) {
  return (
    <div className="week-strip" role="tablist" aria-label="Días de la semana">
      {week.map(({ date, meals }) => {
        const k = plannedTotals(MEALS.flatMap((m) => meals[m])).kcal
        const ratio = goal > 0 ? k / goal : 0
        const state = dayStatus(k, goal)
        return (
          <button
            key={date}
            role="tab"
            aria-selected={date === selected}
            className={`strip-day ${date === selected ? 'selected' : ''} ${date === today ? 'today' : ''}`}
            onClick={() => onSelect(date)}
          >
            <span className="strip-name">{weekdayName(date, 'short').replace('.', '')}</span>
            <span className="strip-num">{parseIso(date).getDate()}</span>
            <span className={`strip-kcal status-${state}`}>{k ? kcal(k) : '–'}</span>
            <span className="strip-bar" aria-hidden="true">
              <span className={`status-${state}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** The selected day's totals against the goal. */
function DaySummary({ items, goals, date, onMenu }: { items: Planned[]; goals: Goals; date: string; onMenu: () => void }) {
  const total = plannedTotals(items)
  const target = goalGrams(goals)
  const left = goals.kcal - total.kcal
  return (
    <section className="card day-summary" aria-label={`Resumen del ${weekdayName(date)}`}>
      <header className="day-summary-head">
        <div>
          <h2>{weekdayName(date)}</h2>
          <span className="muted">{dayLabel(date)}</span>
        </div>
        <button className="icon-btn" onClick={onMenu} aria-label={`Opciones del ${weekdayName(date)}`}>
          <MoreIcon />
        </button>
      </header>
      {items.length === 0 ? (
        <p className="empty">Nada planificado para este día. Añade alimentos a sus comidas o importa un plan.</p>
      ) : (
        <>
          <div className="day-kcal-line">
            <strong>{kcal(total.kcal)}</strong>
            <span className="muted"> de {kcal(goals.kcal)} kcal</span>
            <span className={`day-left ${wellOver(total.kcal, goals.kcal) ? 'over' : ''}`}>
              {dayStatus(total.kcal, goals.kcal) === 'good' ? 'en tu objetivo' : left < 0 ? `${kcal(-left)} por encima` : `faltan ${kcal(left)}`}
            </span>
          </div>
          <ul className="day-macros">
            {MACROS.map((m) => (
              <li key={m} className={`macro-${m}`}>
                <div className="day-macro-top">
                  <span>{MACRO_LABEL[m]}</span>
                  <span>
                    {num(total[m])} <span className="muted">/ {Math.round(target[m])} g</span>
                  </span>
                </div>
                <div className="bar" aria-hidden="true">
                  <div className="bar-fill" style={{ width: `${Math.min(target[m] > 0 ? total[m] / target[m] : 0, 1) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="hint">Previsto con el plan. Se convierte en real al marcarlo como comido en Diario.</p>
        </>
      )}
    </section>
  )
}

/** One meal of the selected day, with what it adds up to. */
function MealCard({ meal, items, onAdd }: { meal: Meal; items: Planned[]; onAdd: () => void }) {
  const total = plannedTotals(items)
  return (
    <section className="card plan-meal-card" aria-label={MEAL_LABEL[meal]}>
      <header className="plan-meal-card-head">
        <h3>{MEAL_LABEL[meal]}</h3>
        {items.length > 0 && <span className="plan-meal-kcal">{kcal(total.kcal)} kcal</span>}
      </header>
      {items.length > 0 && (
        <>
          <p className="plan-meal-macros muted">
            {MACROS.map((m) => `${MACRO_SHORT[m]} ${num(total[m])} g`).join(' · ')}
          </p>
          <ul className="plan-items">
            {items.map((p) => (
              <li key={p.id}>
                <span className="plan-name">{p.name}</span>
                <span className="plan-amount muted">{gramsText(p.grams)}</span>
                <span className="plan-item-kcal">{kcal(scale(p.per100, p.grams).kcal)}</span>
                <button className="icon-btn" aria-label={`Quitar ${p.name}`} onClick={() => db.planned.delete(p.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <button className="add-btn" onClick={onAdd}>
        <span aria-hidden="true">+</span> Añadir
      </button>
    </section>
  )
}

function DayMenu({ date, weekStart, text, onClose }: { date: string; weekStart: string; text: string; onClose: () => void }) {
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
        <button
          className="choice-card"
          disabled={!text}
          onClick={async () => {
            onClose()
            await shareText(`Plan del ${weekdayName(date).toLowerCase()}`, text)
          }}
        >
          <strong>
            <ShareIcon /> {canShare() ? 'Compartir este día' : 'Copiar este día'}
          </strong>
          <span className="muted">Lo planificado, comida a comida, listo para enviar.</span>
        </button>
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
          className="choice-card danger"
          onClick={async () => {
            onClose()
            if (await askConfirm('Se quita del plan todo lo de este día.', { title: `¿Vaciar el ${weekdayName(date).toLowerCase()}?`, confirmLabel: 'Vaciar', danger: true }))
              await db.planned.where('date').equals(date).delete()
          }}
        >
          <strong>Vaciar el día</strong>
          <span className="muted">Quita del plan todo lo de este día.</span>
        </button>
      </div>
    </Sheet>
  )
}

const small = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

function SparkIcon() {
  return (
    <svg {...small}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg {...small}>
      <path d="M3 4h2l2.4 11h10.8L20 8H6.2" />
      <circle cx="9.5" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}
