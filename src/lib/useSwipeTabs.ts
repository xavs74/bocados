import { useEffect, type RefObject } from 'react'

/** Horizontal distance (px) that switches tabs on release. */
const DISTANCE = 80
/** A quick flick switches with less distance. */
const FLICK_SPEED = 0.45 // px per ms
const FLICK_DISTANCE = 35
/** Touches this close to the screen edge belong to the browser's back/forward gestures. */
const EDGE = 24

/**
 * Swiping horizontally over `area` moves to the previous or next tab. The
 * content follows the finger, then slides in from the side it came from.
 * Elements marked `data-no-swipe` (like the macro split bar) keep their own
 * horizontal dragging.
 */
export function useSwipeTabs(area: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>, onSwipe: (dir: 1 | -1) => boolean) {
  useEffect(() => {
    const el = area.current
    if (!el) return

    let start: { x: number; y: number; t: number } | null = null
    let axis: 'x' | 'y' | null = null
    let dx = 0

    const setOffset = (px: number, animate: boolean) => {
      const c = content.current
      if (!c) return
      c.style.transition = animate ? 'transform 0.2s ease, opacity 0.2s ease' : 'none'
      c.style.transform = px ? `translateX(${px}px)` : ''
      c.style.opacity = px ? String(Math.max(0.6, 1 - Math.abs(px) / 600)) : ''
    }

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      const target = e.target as Element
      if (
        e.touches.length !== 1 ||
        t.clientX < EDGE ||
        t.clientX > window.innerWidth - EDGE ||
        target.closest('[data-no-swipe], input, select, textarea')
      ) {
        start = null
        return
      }
      start = { x: t.clientX, y: t.clientY, t: e.timeStamp }
      axis = null
      dx = 0
    }

    const onMove = (e: TouchEvent) => {
      if (!start) return
      const t = e.touches[0]
      dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (!axis) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y'
      }
      if (axis !== 'x') return
      e.preventDefault() // keep the page from scrolling while swiping sideways
      setOffset(dx * 0.5, false)
    }

    const onEnd = (e: TouchEvent) => {
      if (!start || axis !== 'x') {
        start = null
        return
      }
      const speed = Math.abs(dx) / Math.max(e.timeStamp - start.t, 1)
      const committed = Math.abs(dx) > DISTANCE || (speed > FLICK_SPEED && Math.abs(dx) > FLICK_DISTANCE)
      start = null
      const dir = dx < 0 ? 1 : -1
      if (committed && onSwipe(dir)) {
        const c = content.current
        setOffset(0, false)
        if (c) {
          c.classList.remove('enter-from-left', 'enter-from-right')
          void c.offsetWidth // restart the animation if it's the same class
          c.classList.add(dir === 1 ? 'enter-from-right' : 'enter-from-left')
        }
      } else {
        setOffset(0, true)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', () => {
      start = null
      setOffset(0, true)
    })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [area, content, onSwipe])
}
