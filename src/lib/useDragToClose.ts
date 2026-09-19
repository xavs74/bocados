import { useEffect, useRef, type RefObject } from 'react'

/** Share of the sheet's height it has to travel before letting go closes it. */
const CLOSE_RATIO = 0.3
/** A quick flick closes it sooner, as native sheets do (px per ms). */
const FLICK_SPEED = 0.6
const FLICK_MIN = 40
const OUT_MS = 220

/**
 * Lets a bottom sheet be dragged down to close it. The drag starts anywhere on
 * the sheet, except while its content is scrolled down (then the finger
 * scrolls it back up as usual) and on controls that need vertical drags of
 * their own. Only on phones: from 720 px wide the sheet is a centred dialog.
 */
export function useDragToClose(sheetRef: RefObject<HTMLElement | null>, backdropRef: RefObject<HTMLElement | null>, onClose: () => void, enabled: boolean) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const sheet = sheetRef.current
    const backdrop = backdropRef.current
    if (!enabled || !sheet || !backdrop) return

    let startY = 0
    let startX = 0
    let startT = 0
    let lastY = 0
    let lastT = 0
    let scroller: HTMLElement | null = null
    // null: not decided yet; true: dragging the sheet; false: leave it to the browser.
    let dragging: boolean | null = null
    let closing = false

    const phone = () => !window.matchMedia('(min-width: 720px)').matches

    const setOffset = (y: number, animate: boolean) => {
      const t = animate ? `transform ${OUT_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)` : 'none'
      sheet.style.transition = t
      sheet.style.transform = y ? `translateY(${y}px)` : ''
      backdrop.style.transition = animate ? `background-color ${OUT_MS}ms ease` : 'none'
      const fade = Math.max(0, 1 - y / sheet.offsetHeight)
      backdrop.style.backgroundColor = y ? `rgba(10, 10, 8, ${0.4 * fade})` : ''
    }

    const onStart = (e: TouchEvent) => {
      if (closing || e.touches.length !== 1 || !phone()) {
        dragging = false
        return
      }
      const target = e.target as HTMLElement
      if (target.closest('textarea, input[type="range"], [data-no-drag]')) {
        dragging = false
        return
      }
      const t = e.touches[0]
      startY = lastY = t.clientY
      startX = t.clientX
      startT = lastT = e.timeStamp
      // The nearest scrollable box between the finger and the sheet, if any.
      scroller = null
      for (let el: HTMLElement | null = target; el && el !== sheet; el = el.parentElement) {
        if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) {
          scroller = el
          break
        }
      }
      dragging = null
    }

    const onMove = (e: TouchEvent) => {
      if (dragging === false) return
      const t = e.touches[0]
      const dy = t.clientY - startY
      const dx = t.clientX - startX
      if (dragging === null) {
        if (Math.abs(dy) < 4 && Math.abs(dx) < 4) return
        dragging = dy > 0 && dy > Math.abs(dx) && (!scroller || scroller.scrollTop <= 0)
        if (!dragging) return
        // Dragging with the keyboard up would move the sheet under it.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      }
      e.preventDefault()
      lastY = t.clientY
      lastT = e.timeStamp
      setOffset(Math.max(0, dy), false)
    }

    const onEnd = (e: TouchEvent) => {
      if (!dragging) {
        dragging = null
        return
      }
      dragging = null
      const dy = Math.max(0, lastY - startY)
      const recent = e.timeStamp - lastT < 100
      const speed = recent ? dy / Math.max(1, lastT - startT) : 0
      if (dy > sheet.offsetHeight * CLOSE_RATIO || (speed > FLICK_SPEED && dy > FLICK_MIN)) {
        closing = true
        setOffset(sheet.offsetHeight + 24, true)
        window.setTimeout(() => closeRef.current(), OUT_MS)
      } else {
        setOffset(0, true)
      }
    }

    sheet.addEventListener('touchstart', onStart, { passive: true })
    sheet.addEventListener('touchmove', onMove, { passive: false })
    sheet.addEventListener('touchend', onEnd)
    sheet.addEventListener('touchcancel', onEnd)
    return () => {
      sheet.removeEventListener('touchstart', onStart)
      sheet.removeEventListener('touchmove', onMove)
      sheet.removeEventListener('touchend', onEnd)
      sheet.removeEventListener('touchcancel', onEnd)
    }
  }, [sheetRef, backdropRef, enabled])
}
