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
let update: () => void = () => {}

export function trackVisualViewport(): void {
  const root = document.documentElement
  const vv = window.visualViewport
  const touch = window.matchMedia('(pointer: coarse)')

  if (vv) {
    update = () => {
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

/**
 * Puts the app back after a sheet closes. When a sheet with a focused field
 * goes away while the keyboard is up, iOS may keep the page scrolled and not
 * report the keyboard closing, which left the tab bar floating above the
 * bottom of the screen. Scroll back and re-measure while the keyboard animates
 * away.
 */
export function settleViewport(): void {
  const root = document.documentElement
  const settle = () => {
    if (!isTextField(document.activeElement)) {
      root.classList.remove('keyboard-open')
      if (window.scrollY !== 0) window.scrollTo(0, 0)
    }
    update()
  }
  settle()
  for (const ms of [120, 350, 700]) setTimeout(settle, ms)
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
