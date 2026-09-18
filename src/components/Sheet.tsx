import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { settleViewport } from '../lib/viewport'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/**
 * Bottom sheet on phones, centered dialog on wider screens.
 *
 * Rendered straight into <body>: inside the app's scrolling area, iOS Safari
 * clips fixed elements to that area, which cut the bottom of sheets off
 * behind the tab bar with no way to scroll to it.
 */
export function Sheet({ title, onClose, children, footer }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('sheet-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('sheet-open')
    }
  }, [onClose])

  // Closing a sheet while the keyboard is up can leave iOS scrolled; put the app back.
  useEffect(() => settleViewport, [])

  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
