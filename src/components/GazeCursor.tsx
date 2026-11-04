import type { CSSProperties } from 'react'
import type { CursorState } from '../lib/gazeTypes'

export function GazeCursor({
  cursor,
  dwellProgress,
  active,
}: {
  cursor: CursorState | null
  dwellProgress: number
  active: boolean
}) {
  if (!cursor || !active) return null

  const style = {
    transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
    '--cursor-confidence': cursor.confidence.toFixed(2),
    '--dwell-progress': `${Math.round(dwellProgress * 360)}deg`,
  } as CSSProperties

  return (
    <div className="gaze-cursor" style={style} aria-hidden="true">
      <span className="gaze-cursor__halo" />
      <span className="gaze-cursor__ring" />
      <span className="gaze-cursor__core" />
    </div>
  )
}
