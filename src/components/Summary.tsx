import { isComplete, tdee } from '../lib/energy'
import { kcal, num, pct } from '../lib/format'
import {
  MACROS,
  MACRO_LABEL,
  MACRO_SHORT,
  calorieSplit,
  goalGrams,
  onTarget,
  type Goals,
  type MacroKey,
  type Nutrients,
} from '../lib/nutrition'

interface Props {
  totals: Nutrients
  goals: Goals
  /** A finished day: its balance is what was eaten, not a forecast. */
  isPast: boolean
  /** Calories still planned for the day and not eaten yet. */
  plannedKcal?: number
  /** False until the person chooses a goal: no targets are shown then. */
  goalSet?: boolean
}

/** Before there's a goal: what was eaten, and a way to set one. Nothing pretends to be personal. */
function NoGoalSummary({ totals }: { totals: Nutrients }) {
  const split = calorieSplit(totals)
  const hasFood = totals.carbs + totals.protein + totals.fat > 0
  return (
    <section className="card summary" aria-label="Resumen del día">
      <div className="no-goal">
        <strong>{kcal(totals.kcal)}</strong>
        <span>kcal comidas hoy</span>
      </div>
      <ul className="ring-legend" aria-label="Reparto de calorías">
        {MACROS.map((m) => (
          <li key={m} className={`macro-${m}`}>
            <span className="swatch" aria-hidden="true" />
            <span>{MACRO_SHORT[m]}</span>
            <strong>{hasFood ? pct(split[m]) : '–'}</strong>
          </li>
        ))}
      </ul>
      <div className="no-goal-banner">
        <p>
          <strong>Aún no tienes objetivo.</strong> Calcúlalo en un minuto para ver lo que te queda cada día.
        </p>
        <a className="btn primary small" href="#/goals">
          Calcular mi objetivo
        </a>
      </div>
    </section>
  )
}

export function Summary({ totals, goals, isPast, plannedKcal = 0, goalSet = true }: Props) {
  if (!goalSet) return <NoGoalSummary totals={totals} />
  const remaining = goals.kcal - totals.kcal
  const progress = goals.kcal > 0 ? totals.kcal / goals.kcal : 0
  const split = calorieSplit(totals)
  const targets = goalGrams(goals)
  const hasFood = totals.carbs + totals.protein + totals.fat > 0
  const burn = goals.mode === 'calculated' && isComplete(goals.profile) ? tdee(goals.profile) : null

  return (
    <section className="card summary" aria-label="Resumen del día">
      <div className="ring-wrap">
        <Ring progress={progress} split={hasFood ? split : null} />
        <div className="ring-center">
          <strong className={remaining < 0 ? 'over' : ''}>{kcal(Math.abs(remaining))}</strong>
          <span>{remaining < 0 ? 'kcal de más' : 'kcal restantes'}</span>
        </div>
      </div>
      <p className="ring-caption">
        {kcal(totals.kcal)} de {kcal(goals.kcal)} kcal
        {plannedKcal > 0 && (
          <span className="planned-caption">
            Con lo planificado: <strong>{kcal(totals.kcal + plannedKcal)} kcal</strong>
          </span>
        )}
      </p>

      <ul className="ring-legend" aria-label="Reparto de calorías">
        {MACROS.map((m) => (
          <li key={m} className={`macro-${m}`}>
            <span className="swatch" aria-hidden="true" />
            <span>{MACRO_SHORT[m]}</span>
            <strong>{hasFood ? pct(split[m]) : '–'}</strong>
          </li>
        ))}
      </ul>

      {burn !== null && <Balance eaten={totals.kcal} goal={goals.kcal} burn={burn} isPast={isPast} />}

      <ul className="macro-list">
        {MACROS.map((m) => {
          const ratio = targets[m] > 0 ? totals[m] / targets[m] : 0
          const status = statusOf(hasFood, split[m], goals.split[m])
          return (
            <li key={m} className={`macro macro-${m}`}>
              <div className="macro-top">
                <span className="macro-name">{MACRO_LABEL[m]}</span>
                <span className="macro-grams">
                  {num(totals[m])} <span className="muted">/ {Math.round(targets[m])} g</span>
                </span>
              </div>
              <div
                className="bar"
                role="progressbar"
                aria-valuenow={Math.round(ratio * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${MACRO_LABEL[m]}, gramos`}
              >
                <div className="bar-fill" style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
                {ratio > 1 && <div className="bar-over" style={{ width: `${Math.min(ratio - 1, 1) * 100}%` }} />}
              </div>
              <div className={`macro-split status-${status}`}>
                <span className="dot" aria-hidden="true" />
                <span>{STATUS_TEXT[status]}</span>
                <span className="muted"> · objetivo {pct(goals.split[m])} de las kcal</span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

type Status = 'idle' | 'good' | 'high' | 'low'

const STATUS_TEXT: Record<Status, string> = {
  idle: 'Sin datos',
  good: 'En rango',
  high: 'Por encima',
  low: 'Por debajo',
}

function statusOf(hasFood: boolean, actual: number, target: number): Status {
  if (!hasFood) return 'idle'
  if (onTarget(actual, target)) return 'good'
  return actual > target ? 'high' : 'low'
}

/**
 * Deficit or surplus against the estimated daily burn. Comparing the burn with
 * what's been eaten so far would show a huge deficit every morning, so until
 * the day is over it assumes you'll eat up to your goal (or what you already
 * ate, if that's more).
 */
function Balance({ eaten, goal, burn, isPast }: { eaten: number; goal: number; burn: number; isPast: boolean }) {
  const expected = isPast ? eaten : Math.max(eaten, goal)
  const diff = Math.round(expected - burn)
  const kind = diff > 0 ? 'Exceso' : 'Déficit'
  return (
    <p className="balance">
      Gasto estimado <strong>{kcal(burn)} kcal</strong>
      <span className="balance-sep"> · </span>
      <span className={diff > 0 ? 'surplus' : 'deficit'}>
        {diff === 0 ? 'Sin déficit ni exceso' : isPast ? `${kind} del día` : `${kind} previsto`}
        {diff !== 0 && (
          <>
            {' '}
            <strong>{kcal(Math.abs(diff))} kcal</strong>
          </>
        )}
      </span>
    </p>
  )
}

/**
 * Calorie ring. The filled length is the share of the goal eaten, divided
 * into one coloured segment per macro by its share of the calories.
 */
function Ring({ progress, split }: { progress: number; split: Record<MacroKey, number> | null }) {
  const r = 52
  const c = 2 * Math.PI * r
  const filled = Math.min(progress, 1) * c
  const gap = 2.5

  let offset = 0
  const segments = split
    ? MACROS.map((m) => {
        const len = (split[m] / 100) * filled
        const seg = { m, start: offset, len }
        offset += len
        return seg
      }).filter((s) => s.len > 0.5)
    : []

  return (
    <svg className="ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle className="ring-track" cx="60" cy="60" r={r} />
      {segments.map(({ m, start, len }) => {
        const visible = segments.length > 1 ? Math.max(len - gap, 0.5) : len
        return (
          <circle
            key={m}
            className={`ring-seg macro-${m}`}
            cx="60"
            cy="60"
            r={r}
            strokeDasharray={`${visible} ${c}`}
            strokeDashoffset={-start}
            transform="rotate(-90 60 60)"
          />
        )
      })}
    </svg>
  )
}
