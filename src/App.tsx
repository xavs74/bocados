import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSwipeTabs } from './lib/useSwipeTabs'
import { Foods } from './screens/Foods'
import { Goals } from './screens/Goals'
import { Today } from './screens/Today'

const TABS = ['today', 'foods', 'goals'] as const
type Tab = (typeof TABS)[number]

function tabFromHash(): Tab {
  const t = location.hash.replace('#/', '') as Tab
  return TABS.includes(t) ? t : 'today'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const mainRef = useRef<HTMLElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  const swipe = useCallback((dir: 1 | -1) => {
    const next = TABS[TABS.indexOf(tabFromHash()) + dir]
    if (!next) return false
    location.hash = `#/${next}`
    return true
  }, [])
  useSwipeTabs(mainRef, innerRef, swipe)

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [tab])

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/today">
          <Logo />
          <span>Bocados</span>
        </a>
      </header>
    <nav className="nav" aria-label="Principal">
        <NavLink tab="today" current={tab} icon={<TodayIcon />}>
          Diario
        </NavLink>
        <NavLink tab="foods" current={tab} icon={<FoodsIcon />}>
          Alimentos
        </NavLink>
        <NavLink tab="goals" current={tab} icon={<GoalsIcon />}>
          Objetivos
        </NavLink>
      </nav>
      {/* Only this area scrolls, so the header and tab bar never move with the page. */}
      <main className="main" ref={mainRef}>
        <div className="main-inner" ref={innerRef} onAnimationEnd={(e) => e.target === e.currentTarget && e.currentTarget.classList.remove('enter-from-left', 'enter-from-right')}>
          {tab === 'today' && <Today />}
          {tab === 'foods' && <Foods />}
          {tab === 'goals' && <Goals />}
        </div>
      </main>
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
function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <path d={LOGO_PATH} fill="currentColor" />
    </svg>
  )
}

const LOGO_PATH =
  'M16 3a13 13 0 1 0 12.9 11.4 4 4 0 0 1-5.2-4.1 4 4 0 0 1-3.6-6.8A13 13 0 0 0 16 3z'

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

function TodayIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5A8.5 8.5 0 0 1 20.5 12H12z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function FoodsIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 6h16M4 12h16M4 18h10" />
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
