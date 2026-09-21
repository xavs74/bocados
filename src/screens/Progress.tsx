import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, useState } from 'react'
import { WeightSheet } from '../components/WeightSheet'
import { db, type Weight } from '../db'
import { useGoalsState } from '../hooks'
import { dayStatus } from '../lib/calendar'
import { addDays, isoDate, shortDate, weekLabel } from '../lib/dates'
import { inputNum, kcal, num } from '../lib/format'
import { MACROS, MACRO_LABEL, goalGrams } from '../lib/nutrition'
import { dailyTotals, periodStats, weeklyAverages, weightTrend } from '../lib/progress'

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
  const weights = useLiveQuery(() => db.weights.toArray(), [])
  const inPeriod = useMemo(() => (weights ?? []).filter((w) => w.date >= from && w.date <= today).sort((a, b) => a.date.localeCompare(b.date)), [weights, from, today])
  const [weighing, setWeighing] = useState<Weight | 'new' | null>(null)
  const closeWeight = useCallback(() => setWeighing(null), [])

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

      {entries === undefined ? null : stats.logged === 0 && inPeriod.length === 0 ? (
        <section className="card pad">
          <h2 className="section-title">Aún no hay nada que mirar</h2>
          <p className="hint">
            Apunta lo que comes unos días y aquí verás tu media diaria, cuántos días te quedas cerca de tu objetivo y cómo van tus macros.
          </p>
        </section>
      ) : (
        <>
          {stats.logged > 0 && (
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
          )}

          <WeightCard weights={inPeriod} weeks={weeks} onAdd={() => setWeighing('new')} onPick={setWeighing} />

          <section className="card pad" aria-label="Semana a semana">
            <h2 className="section-title">Semana a semana</h2>
            <WeekBars weeks={byWeek} goal={goalSet ? goals.kcal : 0} />
          </section>

          {goalSet && stats.logged > 0 && (
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
      {weighing && <WeightSheet {...(weighing === 'new' ? {} : { date: weighing.date, kg: weighing.kg })} onClose={closeWeight} />}
    </div>
  )
}

/**
 * Weigh-ins over the period with the line through them. The line is the point:
 * weight swings about a kilo with water and salt, so single readings mislead.
 */
function WeightCard({ weights, weeks, onAdd, onPick }: { weights: Weight[]; weeks: number; onAdd: () => void; onPick: (w: Weight) => void }) {
  const trend = weightTrend(weights)
  const last = weights[weights.length - 1]
  return (
    <section className="card pad" aria-label="Peso">
      <div className="card-head">
        <h2 className="section-title">Peso</h2>
        <button className="btn ghost small" onClick={onAdd}>
          Apuntar mi peso
        </button>
      </div>
      {weights.length === 0 ? (
        <p className="hint">
          Apúntate el peso una o dos veces por semana y aquí verás hacia dónde va. Más adelante servirá para ajustar tu objetivo con tus propios datos.
        </p>
      ) : (
        <>
          <p className="big-number">
            <strong>{inputNum(last.kg)}</strong> kg
            {trend && (
              <span className="muted">
                {' '}
                · {trend.kgPerWeek === 0 ? 'estable' : `${trend.kgPerWeek < 0 ? 'bajando' : 'subiendo'} ${inputNum(Math.abs(trend.kgPerWeek))} kg por semana`}
              </span>
            )}
          </p>
          <WeightChart weights={weights} onPick={onPick} />
          <p className="hint">
            {weights.length === 1
              ? 'Con un solo peso no hay tendencia todavía. Apunta otro en unos días.'
              : `${weights.length} pesos en ${weeks} semanas. La línea es la tendencia; los puntos suben y bajan con el agua y la sal.`}
          </p>
        </>
      )}
    </section>
  )
}

const CHART = { w: 320, h: 120, pad: 10 }

function WeightChart({ weights, onPick }: { weights: Weight[]; onPick: (w: Weight) => void }) {
  const trend = weightTrend(weights)
  const kgs = weights.map((w) => w.kg)
  const lowest = Math.min(...kgs, trend ? Math.min(trend.from, trend.to) : Infinity)
  const highest = Math.max(...kgs, trend ? Math.max(trend.from, trend.to) : -Infinity)
  // A flat month should look flat, not like a mountain range, so the scale has a floor of 2 kg.
  const span = Math.max(highest - lowest, 2)
  const mid = (highest + lowest) / 2
  const top = mid + span / 2
  const first = Date.parse(`${weights[0].date}T00:00:00`)
  const days = Math.max(1, (Date.parse(`${weights[weights.length - 1].date}T00:00:00`) - first) / 86400000)
  const x = (date: string) => CHART.pad + ((Date.parse(`${date}T00:00:00`) - first) / 86400000 / days) * (CHART.w - CHART.pad * 2)
  const y = (kg: number) => CHART.pad + ((top - kg) / span) * (CHART.h - CHART.pad * 2)

  return (
    <div className="weight-chart">
      <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} role="img" aria-label={`Peso de ${inputNum(weights[0].kg)} a ${inputNum(weights[weights.length - 1].kg)} kilos`}>
        <polyline className="weight-line" points={weights.map((w) => `${x(w.date)},${y(w.kg)}`).join(' ')} />
        {trend && <line className="weight-trend" x1={x(weights[0].date)} y1={y(trend.from)} x2={x(weights[weights.length - 1].date)} y2={y(trend.to)} />}
        {weights.map((w) => (
          <circle key={w.date} className="weight-dot" cx={x(w.date)} cy={y(w.kg)} r="4" onClick={() => onPick(w)}>
            <title>{`${shortDate(w.date)}: ${inputNum(w.kg)} kg`}</title>
          </circle>
        ))}
      </svg>
      <div className="weight-scale muted">
        <span>{inputNum(round1(top))} kg</span>
        <span>{inputNum(round1(top - span))} kg</span>
      </div>
    </div>
  )
}

const round1 = (n: number) => Math.round(n * 10) / 10

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
