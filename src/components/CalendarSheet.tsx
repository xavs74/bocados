import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db'
import { useGoals } from '../hooks'
import { dayStatus, monthGrid, type DayStatus } from '../lib/calendar'
import { isoDate, parseIso } from '../lib/dates'
import { LOCALE, kcal } from '../lib/format'
import { scale } from '../lib/nutrition'
import { Chevron } from './Chevron'
import { Sheet } from './Sheet'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const STATUS_LABEL: Record<Exclude<DayStatus, 'empty'> | 'planned', string> = {
  good: 'Cerca del objetivo',
  low: 'Por debajo',
  high: 'Por encima',
  planned: 'Planificado',
}

interface Props {
  date: string
  onPick: (date: string) => void
  onClose: () => void
}

export function CalendarSheet({ date, onPick, onClose }: Props) {
  return (
    <Sheet title="Calendario" onClose={onClose}>
      <CalendarMonth
        date={date}
        onPick={(d) => {
          onPick(d)
          onClose()
        }}
      />
    </Sheet>
  )
}

/**
 * A month of days marked against the calorie goal. Starts on the month of
 * `date`; give it a key per month to follow `date` into other months.
 */
export function CalendarMonth({ date, onPick }: { date: string; onPick: (date: string) => void }) {
  const initial = parseIso(date)
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() })
  const goals = useGoals()
  const today = isoDate()

  const weeks = monthGrid(view.year, view.month)
  const first = weeks[0].find(Boolean)!
  const last = weeks.at(-1)!.filter(Boolean).at(-1)!

  // Calories per logged day in the month on screen.
  const totals = useLiveQuery(async () => {
    const map = new Map<string, number>()
    await db.entries
      .where('date')
      .between(first, last, true, true)
      .each((e) => map.set(e.date, (map.get(e.date) ?? 0) + scale(e.per100, e.grams).kcal))
    return map
  }, [first, last])

  // Days with foods planned but not yet eaten get an empty ring.
  const plannedDays = useLiveQuery(async () => {
    const days = new Set<string>()
    await db.planned
      .where('date')
      .between(first, last, true, true)
      .each((p) => days.add(p.date))
    return days
  }, [first, last])

  const logged = totals ? [...totals.values()] : []
  const average = logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : 0
  const onTarget = logged.filter((k) => dayStatus(k, goals.kcal) === 'good').length

  function shift(months: number) {
    const d = new Date(view.year, view.month + months, 1)
    setView({ year: d.getFullYear(), month: d.getMonth() })
  }

  const title = new Date(view.year, view.month, 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })

  return (
    <div className="calendar">
      <div className="cal-head">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Mes anterior">
          <Chevron dir="left" />
        </button>
        <h3 className="cal-title">{title.charAt(0).toUpperCase() + title.slice(1)}</h3>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Mes siguiente">
          <Chevron dir="right" />
        </button>
      </div>

      <table className="cal-grid">
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, i) => (
            <tr key={i}>
              {week.map((day, j) => {
                if (!day) return <td key={j} />
                const k = totals?.get(day)
                const planned = !k && !!plannedDays?.has(day)
                const status = planned ? 'planned' : dayStatus(k, goals.kcal)
                const label = parseIso(day).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })
                return (
                  <td key={j}>
                    <button
                      className={`cal-day status-${status} ${day === date ? 'selected' : ''} ${day === today ? 'today' : ''}`}
                      onClick={() => onPick(day)}
                      aria-label={`${label}${k ? `, ${kcal(k)} kcal, ${STATUS_LABEL[status as keyof typeof STATUS_LABEL].toLowerCase()}` : planned ? ', con plan pendiente' : ', sin registros'}`}
                      aria-current={day === date ? 'date' : undefined}
                    >
                      <span className="cal-num">{parseIso(day).getDate()}</span>
                      <span className="cal-mark" aria-hidden="true" />
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="cal-legend">
        {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[])
          .filter((s) => s !== 'planned' || (plannedDays?.size ?? 0) > 0)
          .map((s) => (
          <li key={s} className={`status-${s}`}>
            <span className="cal-mark" aria-hidden="true" />
            {STATUS_LABEL[s]}
          </li>
        ))}
      </ul>

      <div className="cal-stats">
        <div>
          <strong>{logged.length}</strong>
          <span>días registrados</span>
        </div>
        <div>
          <strong>{logged.length ? kcal(average) : '–'}</strong>
          <span>kcal de media</span>
        </div>
        <div>
          <strong>{onTarget}</strong>
          <span>cerca del objetivo</span>
        </div>
      </div>

      {date !== today && (
        <button
          className="btn ghost block"
          onClick={() => onPick(today)}
        >
          Ir a hoy
        </button>
      )}
    </div>
  )
}
