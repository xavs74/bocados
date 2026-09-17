import type { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  footer?: ReactNode
  actions?: ReactNode
}

/** A docked panel with the same parts as a Sheet, for the laptop layout. */
export function Panel({ title, children, footer, actions }: Props) {
  return (
    <section className="panel card" aria-label={title}>
      <header className="panel-header">
        <h2>{title}</h2>
        {actions}
      </header>
      <div className="panel-body">{children}</div>
      {footer && <footer className="panel-footer">{footer}</footer>}
    </section>
  )
}
