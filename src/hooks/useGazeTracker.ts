import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createGazeLandmarker, detectGaze } from '../lib/faceLandmarker'
import { loadGazeModel, predictModelGaze } from '../lib/gazeModel'
import type { ModelGaze } from '../lib/gazeModel'
import {
  buildFeatureVector,
  clearStoredCalibration,
  fitCalibration,
  loadCalibration,
  predictCalibration,
  saveCalibration,
} from '../lib/calibration'
import type {
  CalibrationModel,
  CalibrationSample,
} from '../lib/calibration'
import { OneEuroFilter } from '../lib/oneEuro'
import type { CursorState, GazeFrame, ScreenPoint } from '../lib/gazeTypes'

type TrackerStatus = 'idle' | 'loading' | 'ready' | 'error'

const waitForFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

export function useGazeTracker(
  videoRef: RefObject<HTMLVideoElement | null>,
  previewCanvasRef: RefObject<HTMLCanvasElement | null>,
) {
  const [status, setStatus] = useState<TrackerStatus>('idle')
  const [error, setError] = useState('')
  const [model, setModel] = useState<CalibrationModel | null>(() =>
    loadCalibration(),
  )
  const [gaze, setGaze] = useState<GazeFrame | null>(null)
  const [cursor, setCursor] = useState<CursorState | null>(null)
  const [fps, setFps] = useState(0)
  const [demoMode, setDemoMode] = useState(false)
  const [gazeModelReady, setGazeModelReady] = useState(false)

  const landmarkerRef = useRef<any>(null)
  const gazeModelRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const runningRef = useRef(false)
  const lastVideoTimeRef = useRef(-1)
  const lastTimestampRef = useRef(0)
  const latestFrameRef = useRef<GazeFrame | null>(null)
  const latestLandmarksRef = useRef<any[] | null>(null)
  const modelGazeRef = useRef<ModelGaze | null>(null)
  const modelBusyRef = useRef(false)
  const modelFrameRef = useRef(0)
  const modelRef = useRef<CalibrationModel | null>(model)
  const demoModeRef = useRef(false)
  const lastUiRef = useRef(0)
  const fpsCounterRef = useRef({ frames: 0, startedAt: 0 })
  const filterXRef = useRef(new OneEuroFilter())
  const filterYRef = useRef(new OneEuroFilter())

  useEffect(() => {
    modelRef.current = model
  }, [model])

  useEffect(() => {
    demoModeRef.current = demoMode
  }, [demoMode])

  const drawPreview = useCallback(
    (landmarks: any[] | null) => {
      const canvas = previewCanvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)
      if (!landmarks) return

      const point = (index: number) => {
        const landmark = landmarks[index]
        return landmark
          ? { x: (1 - landmark.x) * width, y: landmark.y * height }
          : null
      }

      const leftContour = [33, 133, 159, 145]
        .map(point)
        .filter(Boolean) as Array<{ x: number; y: number }>
      const rightContour = [263, 362, 386, 374]
        .map(point)
        .filter(Boolean) as Array<{ x: number; y: number }>

      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgba(126, 240, 210, 0.8)'
      for (const contour of [leftContour, rightContour]) {
        if (contour.length < 4) continue
        ctx.beginPath()
        ctx.moveTo(contour[0].x, contour[0].y)
        ctx.lineTo(contour[1].x, contour[1].y)
        ctx.lineTo(contour[2].x, contour[2].y)
        ctx.lineTo(contour[3].x, contour[3].y)
        ctx.closePath()
        ctx.stroke()
      }

      for (const index of [468, 473]) {
        const iris = point(index)
        if (!iris) continue
        ctx.beginPath()
        ctx.fillStyle = 'rgba(255, 196, 113, 0.95)'
        ctx.arc(iris.x, iris.y, 3.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(255, 196, 113, 0.45)'
        ctx.arc(iris.x, iris.y, 7, 0, Math.PI * 2)
        ctx.stroke()
      }

      const nose = point(1)
      if (nose) {
        ctx.beginPath()
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
        ctx.arc(nose.x, nose.y, 2, 0, Math.PI * 2)
        ctx.fill()
      }
    },
    [previewCanvasRef],
  )

  const loop = useCallback(function loopFrame() {
    if (!runningRef.current) return
    const video = videoRef.current
    const landmarker = landmarkerRef.current

    if (video && landmarker && video.readyState >= 2) {
      const nowTime = performance.now()
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime
        try {
          const timestamp = Math.max(nowTime, lastTimestampRef.current + 1)
          lastTimestampRef.current = timestamp
          const detection = detectGaze(landmarker, video, timestamp)

          if (detection) {
            let frame = detection.frame
            if (
              gazeModelRef.current &&
              !modelBusyRef.current &&
              modelFrameRef.current % 2 === 0
            ) {
              modelBusyRef.current = true
              const snapshot = detection.frame
              const landmarks = detection.landmarks
              void predictModelGaze(gazeModelRef.current, video, landmarks, snapshot)
                .then((result) => {
                  if (result) modelGazeRef.current = result
                })
                .catch((caught) => {
                  console.warn('Gaze model inference failed', caught)
                })
                .finally(() => {
                  modelBusyRef.current = false
                })
            }
            modelFrameRef.current += 1
            const modelGaze = modelGazeRef.current
            if (modelGaze) {
              frame = {
                ...frame,
                modelPitch: modelGaze.pitch,
                modelYaw: modelGaze.yaw,
                modelConfidence: modelGaze.confidence,
              }
            }
            latestFrameRef.current = frame
            latestLandmarksRef.current = detection.landmarks

            if (nowTime - lastUiRef.current > 55) {
              lastUiRef.current = nowTime
              setGaze(frame)
            }

            if (!demoModeRef.current) {
              const currentModel = modelRef.current
              if (currentModel && frame.confidence > 0.18) {
                const features = buildFeatureVector(frame)
                const raw = predictCalibration(currentModel, features)
                const filteredX = filterXRef.current.filter(raw.x, nowTime)
                const filteredY = filterYRef.current.filter(raw.y, nowTime)
                setCursor({
                  x: filteredX * window.innerWidth,
                  y: filteredY * window.innerHeight,
                  confidence: frame.confidence,
                  source: 'gaze',
                })
              } else {
                setCursor(null)
              }
            }

            drawPreview(detection.landmarks)
          } else {
            latestFrameRef.current = null
            latestLandmarksRef.current = null
            modelGazeRef.current = null
            if (!demoModeRef.current) {
              setCursor(null)
              setGaze(null)
            }
            drawPreview(null)
          }
        } catch (caught) {
          console.warn('Gaze detection failed', caught)
        }
      }
    }

    fpsCounterRef.current.frames += 1
    const elapsed = now() - fpsCounterRef.current.startedAt
    if (elapsed >= 600) {
      setFps(Math.round((fpsCounterRef.current.frames * 1000) / elapsed))
      fpsCounterRef.current = { frames: 0, startedAt: now() }
    }

    rafRef.current = requestAnimationFrame(loopFrame)
  }, [drawPreview, videoRef])

  const startCamera = useCallback(async () => {
    if (status === 'loading') return
    setError('')
    setStatus('loading')
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('当前浏览器不支持摄像头访问，请使用 Chrome 或 Edge')
      }

      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 960 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false,
        })
        streamRef.current = stream
        const video = videoRef.current
        if (!video) throw new Error('摄像头预览还没有准备好，请重试')
        video.srcObject = stream
        video.muted = true
        video.playsInline = true
        await video.play()
      }

      if (!landmarkerRef.current) {
        landmarkerRef.current = await createGazeLandmarker()
      }
      if (!gazeModelRef.current) {
        try {
          gazeModelRef.current = await loadGazeModel()
          setGazeModelReady(true)
        } catch (caught) {
          console.warn('Gaze model unavailable, using landmark features', caught)
          setGazeModelReady(false)
        }
      }

      runningRef.current = true
      fpsCounterRef.current = { frames: 0, startedAt: performance.now() }
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(loop)
      }
      setStatus('ready')
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : '无法启动摄像头，请检查权限设置'
      setError(message)
      setStatus('error')
    }
  }, [loop, status, videoRef])

  const stopCamera = useCallback(() => {
    runningRef.current = false
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
    setStatus('idle')
    setCursor(null)
  }, [videoRef])

  const enableDemoMode = useCallback((enabled: boolean) => {
    demoModeRef.current = enabled
    setDemoMode(enabled)
    if (enabled) setCursor(null)
  }, [])

  const setPointerGaze = useCallback((point: ScreenPoint) => {
    if (!demoModeRef.current) return
    setCursor({
      x: point.x * window.innerWidth,
      y: point.y * window.innerHeight,
      confidence: 1,
      source: 'pointer',
    })
  }, [])

  const collectCalibrationPoint = useCallback(
    (target: ScreenPoint, durationMs = 1800) =>
      new Promise<CalibrationSample[]>((resolve) => {
        const samples: CalibrationSample[] = []
        const startedAt = performance.now()

        const tick = () => {
          const frame = latestFrameRef.current
          if (
            frame &&
            frame.faceDetected &&
            frame.blink < 0.55 &&
            frame.confidence > 0.25
          ) {
            samples.push({
              features: buildFeatureVector(frame),
              targetX: target.x,
              targetY: target.y,
            })
          }

          if (performance.now() - startedAt >= durationMs) {
            resolve(samples)
            return
          }
          requestAnimationFrame(tick)
        }

        requestAnimationFrame(tick)
      }),
    [],
  )

  const trainCalibration = useCallback((samples: CalibrationSample[]) => {
    const nextModel = fitCalibration(samples)
    saveCalibration(nextModel)
    modelRef.current = nextModel
    filterXRef.current.reset()
    filterYRef.current.reset()
    setModel(nextModel)
    return nextModel
  }, [])

  const clearCalibration = useCallback(() => {
    clearStoredCalibration()
    modelRef.current = null
    setModel(null)
    setCursor(null)
    filterXRef.current.reset()
    filterYRef.current.reset()
  }, [])

  useEffect(() => {
    return () => {
      runningRef.current = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      landmarkerRef.current?.close?.()
    }
  }, [])

  return {
    status,
    error,
    model,
    gaze,
    cursor,
    fps,
    demoMode,
    gazeModelReady,
    startCamera,
    stopCamera,
    enableDemoMode,
    setPointerGaze,
    collectCalibrationPoint,
    trainCalibration,
    clearCalibration,
    waitForFrame,
  }
}

function now() {
  return performance.now()
}
