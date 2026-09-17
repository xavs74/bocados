import { useSyncExternalStore } from 'react'

/** Width from which the laptop layout (sidebar, docked panels, tables) is used. */
export const LAPTOP = '(min-width: 1200px)'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

export const useIsLaptop = () => useMediaQuery(LAPTOP)
