import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CursorState } from '../lib/gazeTypes'
import { Icon } from './Icon'

type Point = { x: number; y: number }
type Stroke = { points: Point[]; color: string; size: number }

const COLORS = ['#ff8f8f', '#ffd166', '#7ef0d2', '#c9b6ff']
const SIZES = [10, 22, 42]

export function DrawingCanvas({
  cursor,
  demoMode,
  onToast,
}: {
  cursor: CursorState | null
  demoMode: boolean
  onToast: (message: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const wasInsideRef = useRef(false)
  const pointerDownRef = useRef(false)
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(SIZES[1])
  const [strokeCount, setStrokeCount] = useState(0)

  const drawSegment = useCallback(
    (from: Point, to: Point, strokeColor: string, strokeSize: number) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!ctx) return
      ctx.save()
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = strokeSize
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.shadowColor = strokeColor
      ctx.shadowBlur = strokeSize * 0.45
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
      ctx.restore()
    },
    [],
  )

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const stroke of strokesRef.current) {
      if (stroke.points.length === 1) {
        ctx.save()
        ctx.fillStyle = stroke.color
        ctx.shadowColor = stroke.color
        ctx.shadowBlur = stroke.size * 0.45
        ctx.beginPath()
        ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      for (let index = 1; index < stroke.points.length; index += 1) {
        drawSegment(
          stroke.points[index - 1],
          stroke.points[index],
          stroke.color,
          stroke.size,
        )
      }
    }
  }, [drawSegment])

  const startStroke = useCallback(
    (point: Point) => {
      const stroke = { points: [point], color, size }
      strokesRef.current.push(stroke)
      setStrokeCount(strokesRef.current.length)
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) {
        ctx.save()
        ctx.fillStyle = color
        ctx.shadowColor = color
        ctx.shadowBlur = size * 0.45
        ctx.beginPath()
        ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    },
    [color, size],
  )

  const appendPoint = useCallback(
    (point: Point) => {
      const stroke = strokesRef.current[strokesRef.current.length - 1]
      if (!stroke) return
      const last = stroke.points[stroke.points.length - 1]
      if (Math.hypot(point.x - last.x, point.y - last.y) < 2.2) return
      stroke.points.push(point)
      drawSegment(last, point, stroke.color, stroke.size)
    },
    [drawSegment],
  )

  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (
      screenX < rect.left ||
      screenX > rect.right ||
      screenY < rect.top ||
      screenY > rect.bottom
    ) {
      return null
    }
    return {
      x: ((screenX - rect.left) / rect.width) * canvas.width,
      y: ((screenY - rect.top) / rect.height) * canvas.height,
    }
  }, [])

  useEffect(() => {
    if (demoMode) {
      wasInsideRef.current = false
      return
    }

    if (!cursor) {
      wasInsideRef.current = false
      return
    }

    const point = screenToCanvas(cursor.x, cursor.y)
    if (!point) {
      wasInsideRef.current = false
      return
    }

    if (!wasInsideRef.current) {
      startStroke(point)
      wasInsideRef.current = true
    } else {
      appendPoint(point)
    }
  }, [appendPoint, cursor, demoMode, screenToCanvas, startStroke])

  const pointerPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!demoMode) return
    const point = pointerPoint(event)
    if (!point) return
    pointerDownRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    startStroke(point)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!demoMode || !pointerDownRef.current) return
    const point = pointerPoint(event)
    if (point) appendPoint(point)
  }

  const handlePointerUp = () => {
    pointerDownRef.current = false
  }

  const undo = () => {
    if (strokesRef.current.length === 0) return
    strokesRef.current.pop()
    redraw()
    setStrokeCount(strokesRef.current.length)
  }

  const clear = () => {
    strokesRef.current = []
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setStrokeCount(0)
  }

  const save = () => {
    const canvas = canvasRef.current
    if (!canvas || strokesRef.current.length === 0) {
      onToast('先留下一点目光的轨迹，再保存作品')
      return
    }
    const output = document.createElement('canvas')
    output.width = canvas.width
    output.height = canvas.height
    const ctx = output.getContext('2d')
    if (!ctx) return
    const gradient = ctx.createLinearGradient(0, 0, output.width, output.height)
    gradient.addColorStop(0, '#0b1220')
    gradient.addColorStop(0.55, '#0f1a2d')
    gradient.addColorStop(1, '#07101d')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, output.width, output.height)
    ctx.drawImage(canvas, 0, 0)
    const link = document.createElement('a')
    link.download = `gaze-canvas-${Date.now()}.png`
    link.href = output.toDataURL('image/png')
    link.click()
    onToast('作品已保存到下载文件夹')
  }

  return (
    <section className="drawing-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">GAZE STUDIO</span>
          <h2>把视线留在画布上</h2>
        </div>
        <span className="section-note">
          {demoMode ? '演示模式：按住鼠标拖动绘制' : '目光进入画布即可留下轨迹'}
        </span>
      </div>

      <div className="studio-shell">
        <div className="studio-toolbar">
          <div className="tool-group">
            <span className="tool-label">颜色</span>
            <div className="color-row">
              {COLORS.map((item) => (
                <button
                  key={item}
                  className={`color-swatch ${color === item ? 'is-active' : ''}`}
                  style={{ background: item }}
                  data-gaze-target
                  onClick={() => setColor(item)}
                  aria-label={`选择颜色 ${item}`}
                  aria-pressed={color === item}
                />
              ))}
            </div>
          </div>
          <div className="tool-group">
            <span className="tool-label">笔触</span>
            <div className="size-row">
              {SIZES.map((item) => (
                <button
                  key={item}
                  className={`size-button ${size === item ? 'is-active' : ''}`}
                  data-gaze-target
                  onClick={() => setSize(item)}
                  aria-label={`选择笔触 ${item}`}
                  aria-pressed={size === item}
                >
                  <span style={{ width: item / 2, height: item / 2 }} />
                </button>
              ))}
            </div>
          </div>
          <div className="tool-actions">
            <button className="tool-button" data-gaze-target onClick={undo}>
              <Icon name="undo" size={16} />
              撤销
            </button>
            <button className="tool-button" data-gaze-target onClick={clear}>
              <Icon name="trash" size={16} />
              清空
            </button>
            <button className="tool-button is-primary" data-gaze-target onClick={save}>
              <Icon name="download" size={16} />
              保存
            </button>
          </div>
        </div>

        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            width={1200}
            height={760}
            className="drawing-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            aria-label="目光绘画画布"
          />
          {strokeCount === 0 && (
            <div className="canvas-empty">
              <span className="canvas-empty__dot" />
              <strong>看这里，留下第一笔</strong>
              <span>{demoMode ? '按住鼠标拖动' : '用目光移动光标'}</span>
            </div>
          )}
          <div className="canvas-caption">
            <span>GAZE TRACE / {strokeCount.toString().padStart(2, '0')}</span>
            <span>1200 × 760</span>
          </div>
        </div>
      </div>
    </section>
  )
}
