/**
 * Keeps the app inside the part of the screen that is actually visible.
 *
 * The app shell and sheets are fixed to the screen. When a phone keyboard opens,
 * iOS shrinks only the visual viewport, so anything sized to the full screen
 * ends up partly behind the keyboard with nothing left to scroll. This mirrors
 * the visual viewport into CSS variables (--vv-top, --vv-height) that the shell
 * and sheets use for their size, and flags when someone is typing so the tab
 * bar can step aside.
 */
export function trackVisualViewport(): void {
  const root = document.documentElement
  const vv = window.visualViewport
  const touch = window.matchMedia('(pointer: coarse)')

  if (vv) {
    const update = () => {
      // Pinch-zoom also shrinks the visual viewport; resizing the app then would fight the zoom.
      if (vv.scale > 1.01) return
      root.style.setProperty('--vv-height', `${vv.height}px`)
      root.style.setProperty('--vv-top', `${vv.offsetTop}px`)
      revealFocused()
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
  }

  document.addEventListener('focusin', (e) => {
    if (!touch.matches || !isTextField(e.target)) return
    root.classList.add('keyboard-open')
    // The keyboard animates in after focus; reveal the field once it has settled.
    setTimeout(revealFocused, 350)
  })
  document.addEventListener('focusout', () => {
    // Moving focus between fields fires focusout then focusin; wait to see where it lands.
    setTimeout(() => {
      if (!isTextField(document.activeElement)) root.classList.remove('keyboard-open')
    }, 50)
  })
}

function isTextField(el: EventTarget | Element | null): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  if (!(el instanceof HTMLInputElement)) return false
  return !['checkbox', 'radio', 'range', 'button', 'submit', 'file'].includes(el.type)
}

function revealFocused() {
  const el = document.activeElement
  if (isTextField(el)) el.scrollIntoView({ block: 'nearest' })
}
