import { useLiveQuery } from 'dexie-react-hooks'
import { Onboarding } from './components/Onboarding'
import { db, dbError } from './db'
import { useDbStatus, useGoalsState } from './hooks'
import { startSync } from './lib/syncRunner'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSwipeTabs } from './lib/useSwipeTabs'
import { Foods } from './screens/Foods'
import { Account } from './screens/Account'
import { Privacy } from './screens/Privacy'
import { Progress } from './screens/Progress'
import { Plan } from './screens/Plan'
import { Goals } from './screens/Goals'
import { Today } from './screens/Today'
import { ConfirmHost } from './components/ConfirmHost'

/** The tabs in the bar, in the order swiping moves through them. */
const TABS = ['today', 'plan', 'progress', 'goals'] as const
type Tab = (typeof TABS)[number]
/** Screens reached from Objetivos rather than the tab bar, with their own address. */
const INSIDE_GOALS = ['foods', 'cuenta', 'privacidad'] as const
type Screen = Tab | (typeof INSIDE_GOALS)[number]

function screenFromHash(): Screen {
  // The address can carry a query, as it does coming back from signing in.
  const t = location.hash.replace('#/', '').split('?')[0] as Screen
  return INSIDE_GOALS.includes(t as 'foods') || TABS.includes(t as Tab) ? t : 'today'
}

function tabFromHash(): Tab {
  const s = screenFromHash()
  // Those screens are reached from Objetivos, so that tab stays the current one.
  return INSIDE_GOALS.includes(s as 'foods') ? 'goals' : (s as Tab)
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(screenFromHash)
  const tab = tabFromHash()
  const mainRef = useRef<HTMLElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  const swipe = useCallback((dir: 1 | -1) => {
    const next = TABS[TABS.indexOf(tabFromHash()) + dir]
    if (!next) return false
    location.hash = `#/${next}`
    return true
  }, [])
  useSwipeTabs(mainRef, innerRef, swipe)

  // Syncing does nothing until this device has been told to; see the account screen.
  useEffect(() => {
    void startSync()
  }, [])

  useEffect(() => {
    const onHash = () => setScreen(screenFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [screen])

  const { set: goalsSet, loaded } = useGoalsState()
  const skipped = useLiveQuery(() => db.settings.get('onboardingSkipped').then((r) => !!r?.value))
  const [setupDone, setSetupDone] = useState(false)
  const showSetup = loaded && skipped === false && !goalsSet && !setupDone

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/today">
          <Logo />
          <span className="wordmark">bocados</span>
        </a>
      </header>
    <nav className="nav" aria-label="Principal">
        <NavLink tab="today" current={tab} icon={<TodayIcon />}>
          Diario
        </NavLink>
        <NavLink tab="plan" current={tab} icon={<PlanIcon />}>
          Plan
        </NavLink>
        <NavLink tab="progress" current={tab} icon={<ProgressIcon />}>
          Progreso
        </NavLink>
        <NavLink tab="goals" current={tab} icon={<GoalsIcon />}>
          Objetivos
        </NavLink>
      </nav>
      {/* Only this area scrolls, so the header and tab bar never move with the page. */}
      <DbBanner />
      <main className="main" ref={mainRef}>
        <div className="main-inner" ref={innerRef} onAnimationEnd={(e) => e.target === e.currentTarget && e.currentTarget.classList.remove('enter-from-left', 'enter-from-right')}>
          {screen === 'today' && <Today />}
          {screen === 'plan' && <Plan />}
          {screen === 'progress' && <Progress />}
          {screen === 'foods' && <Foods />}
          {screen === 'cuenta' && <Account />}
          {screen === 'privacidad' && <Privacy />}
          {screen === 'goals' && <Goals />}
        </div>
      </main>
      <ConfirmHost />
      {showSetup && <Onboarding onDone={() => setSetupDone(true)} />}
    </div>
  )
}

/**
 * Shown when the database won't open. Without it the screens simply stay empty
 * for ever, with nothing to explain why or to do about it.
 */
function DbBanner() {
  const status = useDbStatus()
  if (status === 'open' || status === 'opening') return null
  return (
    <div className="db-banner" role="alert">
      <p>
        <strong>Bocados no puede abrir tus datos.</strong>{' '}
        {status === 'blocked'
          ? 'Tienes la app abierta en otra ventana o pestaña con otra versión. Ciérralas todas y vuelve a abrirla.'
          : `No se ha podido abrir la base de datos de este dispositivo. ${dbError}`}
      </p>
      <p className="hint">Tus datos siguen guardados en el dispositivo; solo hace falta volver a abrir la app.</p>
      <button className="btn primary small" onClick={() => location.reload()}>
        Volver a intentarlo
      </button>
    </div>
  )
}

function NavLink({ tab, current, icon, children }: { tab: Tab; current: Tab; icon: ReactNode; children: ReactNode }) {
  return (
    <a href={`#/${tab}`} className={`nav-link ${tab === current ? 'active' : ''}`} aria-current={tab === current ? 'page' : undefined} title={String(children)}>
      {icon}
      <span>{children}</span>
    </a>
  )
}

/** A plate with a bite taken out of it. */
/** La ramita: an olive branch laid out wide, with one green and one black olive. */
function Logo() {
  return (
    <svg className="logo" viewBox="2 18 96 70" aria-hidden="true">
      <path d="M6 60C32 74 64 32 94 40" fill="none" stroke="var(--fat)" strokeWidth="4" strokeLinecap="round" />
      <path d="M0 0Q9.9-7.3 22 0Q9.9 7.3 0 0Z" fill="var(--leaf)" transform="translate(30.8 60.3) rotate(-61.2)" />
      <path d="M0 0Q9-6.6 20 0Q9 6.6 0 0Z" fill="var(--fat)" transform="translate(44 54.5) rotate(15.4)" />
      <path d="M0 0Q10.8-7.9 24 0Q10.8 7.9 0 0Z" fill="var(--leaf)" transform="translate(59.4 46.7) rotate(-67.8)" />
      <path d="M0 0Q9-6.6 20 0Q9 6.6 0 0Z" fill="var(--fat)" transform="translate(74 40.9) rotate(25.8)" />
      <path d="M0 0Q9.9-7.3 22 0Q9.9 7.3 0 0Z" fill="var(--leaf)" transform="translate(86.8 39) rotate(-40.7)" />
      <ellipse cx="21.5" cy="72.4" rx="10" ry="13" fill="var(--fat)" transform="rotate(-5.6 21.5 72.4)" />
      <ellipse cx="17.6" cy="68.6" rx="2.8" ry="4.3" fill="var(--bg)" opacity=".45" transform="rotate(-5.6 17.6 68.6)" />
      <ellipse cx="57.5" cy="58.6" rx="10" ry="13" fill="var(--olive-black)" transform="rotate(-27.2 57.5 58.6)" />
      <ellipse cx="52.2" cy="55.1" rx="2.8" ry="4.3" fill="var(--bg)" opacity=".45" transform="rotate(-27.2 52.2 55.1)" />
    </svg>
  )
}

const iconProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** Bars rising to the right. */
function ProgressIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 20V11M10 20V4M16 20v-6M21 20H3" />
    </svg>
  )
}

function TodayIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5A8.5 8.5 0 0 1 20.5 12H12z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function PlanIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4M8.5 14h3M8.5 17.2h7" />
    </svg>
  )
}

function GoalsIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
    </svg>
  )
}
