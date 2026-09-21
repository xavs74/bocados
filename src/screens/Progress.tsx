import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../db'
import { useGoalsState } from '../hooks'
import { dayStatus } from '../lib/calendar'
import { addDays, isoDate, shortDate, weekLabel } from '../lib/dates'
import { kcal, num } from '../lib/format'
import { MACROS, MACRO_LABEL, goalGrams } from '../lib/nutrition'
import { dailyTotals, periodStats, weeklyAverages } from '../lib/progress'

const PERIODS = [
  { weeks: 4, label: '4 semanas' },
  { weeks: 12, label: '12 semanas' },
] as const

export function Progress() {
  const [weeks, setWeeks] = useState<number>(4)
  const { goals, set: goalSet } = useGoalsState()
  const today = isoDate()
  const from = addDays(today, -(weeks * 7 - 1))
  const entries = useLiveQuery(() => db.entries.where('date').between(from, today, true, true).toArray(), [from, today])

  const days = useMemo(() => dailyTotals(entries ?? []), [entries])
  const stats = periodStats(days, from, today, goals.kcal)
  const byWeek = weeklyAverages(days, from, weeks)
  const targets = goalGrams(goals)

  return (
    <div className="progress">
      <div className="page-head">
        <h1>Progreso</h1>
      </div>

      <div className="period-switch" role="tablist" aria-label="Periodo">
        {PERIODS.map((p) => (
          <button key={p.weeks} role="tab" aria-selected={weeks === p.weeks} className={weeks === p.weeks ? 'selected' : ''} onClick={() => setWeeks(p.weeks)}>
            {p.label}
          </button>
        ))}
      </div>

      {entries === undefined ? null : stats.logged === 0 ? (
        <section className="card pad">
          <h2 className="section-title">Aún no hay nada que mirar</h2>
          <p className="hint">
            Apunta lo que comes unos días y aquí verás tu media diaria, cuántos días te quedas cerca de tu objetivo y cómo van tus macros.
          </p>
        </section>
      ) : (
        <>
          <section className="card pad" aria-label="Cómo va">
            <h2 className="section-title">Cómo va</h2>
            <p className="big-number">
              <strong>{kcal(stats.meanKcal)}</strong> kcal de media al día
              {goalSet && <span className="muted"> · objetivo {kcal(goals.kcal)}</span>}
            </p>
            <ul className="progress-facts">
              {goalSet && (
                <li>
                  <strong>
                    {stats.onTarget} de {stats.logged}
                  </strong>
                  <span className="muted">días en tu objetivo</span>
                </li>
              )}
              <li>
                <strong>{stats.logged}</strong>
                <span className="muted">días apuntados de {stats.days}</span>
              </li>
            </ul>
            {stats.logged < stats.days / 2 && (
              <p className="hint">Con menos de la mitad de los días apuntados, la media dice poco: cuenta solo lo que has registrado.</p>
            )}
          </section>

          <section className="card pad" aria-label="Semana a semana">
            <h2 className="section-title">Semana a semana</h2>
            <WeekBars weeks={byWeek} goal={goalSet ? goals.kcal : 0} />
          </section>

          {goalSet && (
            <section className="card pad" aria-label="Macros">
              <h2 className="section-title">Macros de media</h2>
              <ul className="macro-list">
                {MACROS.map((m) => {
                  const ratio = targets[m] > 0 ? stats.meanMacros[m] / targets[m] : 0
                  return (
                    <li key={m} className={`macro macro-${m}`}>
                      <div className="macro-top">
                        <span className="macro-name">{MACRO_LABEL[m]}</span>
                        <span className="macro-grams">
                          {num(stats.meanMacros[m])} <span className="muted">/ {Math.round(targets[m])} g</span>
                        </span>
                      </div>
                      <div className="bar" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={MACRO_LABEL[m]}>
                        <div className="bar-fill" style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="hint">Media de los días apuntados, frente a lo que te toca cada día.</p>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/** One bar per week: how its average compares with the goal. */
function WeekBars({ weeks, goal }: { weeks: { start: string; meanKcal: number; logged: number }[]; goal: number }) {
  // Without a goal the tallest week sets the scale, so the bars still compare.
  const top = Math.max(goal, ...weeks.map((w) => w.meanKcal)) * 1.15 || 1
  // Twelve bars have no room for a number each, nor for twelve dates.
  const dense = weeks.length > 6
  return (
    <ul className={`week-bars ${dense ? 'dense' : ''}`}>
      {weeks.map((w, i) => {
        const status = goal > 0 ? dayStatus(w.meanKcal, goal) : w.meanKcal > 0 ? 'good' : 'empty'
        return (
          <li key={w.start} title={`${weekLabel(w.start)}: ${w.logged ? `${kcal(w.meanKcal)} kcal de media, ${w.logged} de 7 días` : 'sin días apuntados'}`}>
            {!dense && <span className="week-bar-value num">{w.logged ? kcal(w.meanKcal) : '–'}</span>}
            <span className="week-bar-track">
              {goal > 0 && <span className="week-bar-goal" style={{ bottom: `${(goal / top) * 100}%` }} aria-hidden="true" />}
              <span className={`week-bar-fill status-${status}`} style={{ height: `${(w.meanKcal / top) * 100}%` }} />
            </span>
            <span className="week-bar-label muted">{!dense || i % 3 === 0 ? shortDate(w.start) : ''}</span>
            {!dense && <span className="week-bar-days muted">{w.logged}/7</span>}
          </li>
        )
      })}
    </ul>
  )
}
