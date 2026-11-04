import { useEffect, useRef, useState } from 'react'
import type { CursorState } from '../lib/gazeTypes'

const DWELL_MS = 780

export function useDwellClick(
  cursor: CursorState | null,
  enabled: boolean,
): number {
  const [progress, setProgress] = useState(0)
  const stateRef = useRef({
    element: null as HTMLElement | null,
    startedAt: 0,
    cooldownUntil: 0,
  })

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest(
        '[data-gaze-target]',
      )
      if (target) stateRef.current.cooldownUntil = performance.now() + 520
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  useEffect(() => {
    const reset = () => {
      const current = stateRef.current.element
      if (current) {
        current.classList.remove('is-dwelling')
        current.style.removeProperty('--dwell-progress')
      }
      stateRef.current.element = null
      stateRef.current.startedAt = 0
      setProgress(0)
    }

    if (!enabled || !cursor) {
      reset()
      return
    }

    const now = performance.now()
    if (now < stateRef.current.cooldownUntil) {
      reset()
      return
    }

    const raw = document.elementFromPoint(cursor.x, cursor.y)
    const element = (raw as HTMLElement | null)?.closest(
      '[data-gaze-target]',
    ) as HTMLElement | null

    if (!element) {
      reset()
      return
    }

    if (stateRef.current.element !== element) {
      reset()
      stateRef.current.element = element
      stateRef.current.startedAt = now
      element.classList.add('is-dwelling')
    }

    const nextProgress = Math.min(
      1,
      (now - stateRef.current.startedAt) / DWELL_MS,
    )
    setProgress(nextProgress)
    element.style.setProperty('--dwell-progress', `${(nextProgress * 100).toFixed(1)}%`)

    if (nextProgress >= 1) {
      element.click()
      stateRef.current.cooldownUntil = now + 650
      reset()
    }
  }, [cursor, enabled])

  return progress
}
