import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { CalibrationOverlay } from './components/CalibrationOverlay'
import { DrawingCanvas } from './components/DrawingCanvas'
import { ExpressionBoard } from './components/ExpressionBoard'
import type { Phrase } from './components/ExpressionBoard'
import { GazeCursor } from './components/GazeCursor'
import { Icon } from './components/Icon'
import { useDwellClick } from './hooks/useDwellClick'
import { useGazeTracker } from './hooks/useGazeTracker'
import type { CalibrationModel } from './lib/calibration'

type Screen = 'welcome' | 'app'
type Mode = 'expression' | 'draw'

const percent = (value: number | undefined) =>
  value === undefined ? '—' : `${Math.round(value * 100)}%`

const degrees = (value: number | undefined) =>
  value === undefined ? '—' : `${((value * 180) / Math.PI).toFixed(1)}°`

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const autoPromptedRef = useRef(false)

  const [screen, setScreen] = useState<Screen>('welcome')
  const [mode, setMode] = useState<Mode>('expression')
  const [calibrationOpen, setCalibrationOpen] = useState(false)
  const [selectedPhrase, setSelectedPhrase] = useState<Phrase | null>(null)
  const [history, setHistory] = useState<Phrase[]>([])
  const [toast, setToast] = useState('')

  const {
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
  } = useGazeTracker(videoRef, previewCanvasRef)

  const dwellProgress = useDwellClick(
    cursor,
    screen === 'app' && !calibrationOpen,
  )

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2800)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (
      screen === 'app' &&
      status === 'ready' &&
      !model &&
      !demoMode &&
      !calibrationOpen &&
      !autoPromptedRef.current
    ) {
      autoPromptedRef.current = true
      const timer = window.setTimeout(() => setCalibrationOpen(true), 550)
      return () => window.clearTimeout(timer)
    }
  }, [calibrationOpen, demoMode, model, screen, status])

  useEffect(() => {
    if (!demoMode || screen !== 'app') return
    const handleMove = (event: PointerEvent) => {
      setPointerGaze({
        x: event.clientX / window.innerWidth,
        y: event.clientY / window.innerHeight,
      })
    }
    window.addEventListener('pointermove', handleMove)
    return () => window.removeEventListener('pointermove', handleMove)
  }, [demoMode, screen, setPointerGaze])

  const startCameraFlow = async () => {
    autoPromptedRef.current = false
    enableDemoMode(false)
    setScreen('app')
    setCalibrationOpen(false)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    )
    await startCamera()
  }

  const startDemo = () => {
    autoPromptedRef.current = true
    enableDemoMode(true)
    setScreen('app')
    setCalibrationOpen(false)
    showToast('演示模式：鼠标位置模拟目光，停留即可选择')
  }

  const goHome = () => {
    stopCamera()
    setScreen('welcome')
    setCalibrationOpen(false)
  }

  const speak = useCallback(
    (phrase: Phrase) => {
      setSelectedPhrase(phrase)
      setHistory((previous) => [phrase, ...previous].slice(0, 8))
      if (phrase.id === 'draw') setMode('draw')

      try {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel()
          const utterance = new SpeechSynthesisUtterance(phrase.text)
          utterance.lang = 'zh-CN'
          utterance.rate = 0.92
          utterance.pitch = 1.02
          window.speechSynthesis.speak(utterance)
        }
      } catch {
        showToast('浏览器暂时无法朗读，但表达已记录')
      }
    },
    [showToast],
  )

  const openCalibration = () => {
    if (demoMode) {
      showToast('演示模式不需要校准，切换到摄像头即可')
      return
    }
    setCalibrationOpen(true)
  }

  const handleCalibrationFinish = (_nextModel: CalibrationModel) => {
    autoPromptedRef.current = true
    showToast('九点校准完成，现在可以用目光选择')
  }

  const toggleDemo = async () => {
    if (demoMode) {
      enableDemoMode(false)
      if (status !== 'ready') {
        setScreen('app')
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        )
        await startCamera()
      }
      return
    }
    startDemo()
  }

  if (screen === 'welcome') {
    return (
      <div className="welcome-screen">
        <div className="welcome-grid" />
        <div className="welcome-orbit orbit-one" />
        <div className="welcome-orbit orbit-two" />
        <div className="welcome-orbit orbit-three" />
        <main className="welcome-card">
          <div className="brand-lockup">
            <div className="brand-mark">
              <Icon name="eye" size={28} />
              <span />
            </div>
            <div>
              <strong>目光所至</strong>
              <span>GAZE CANVAS</span>
            </div>
          </div>
          <span className="eyebrow welcome-eyebrow">A QUIET INTERFACE FOR EVERY EYE</span>
          <h1>
            让目光成为
            <br />
            <em>画笔与语言。</em>
          </h1>
          <p className="welcome-lede">
            用普通摄像头追踪虹膜与头部姿态。看住一个按钮，就能表达一句话；
            看住一片画布，就能留下一道轨迹。
          </p>
          <div className="welcome-actions">
            <button
              className="primary-button large"
              onClick={startCameraFlow}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? <span className="spinner" /> : <Icon name="camera" />}
              {status === 'loading' ? '正在唤醒摄像头…' : '开启摄像头体验'}
              {status !== 'loading' && <Icon name="arrow" />}
            </button>
            <button className="secondary-button large" onClick={startDemo}>
              <Icon name="target" />
              先看演示模式
            </button>
          </div>
          {error && <div className="welcome-error">{error}</div>}
          <div className="welcome-meta">
            <span>
              <Icon name="eye" size={14} /> 478 点面部追踪
            </span>
            <span>九点个体校准</span>
            <span>MPIIGaze 视线模型</span>
            <span>视频仅在本地处理</span>
          </div>
        </main>
        <div className="welcome-side-note">
          <span>01 / 注视</span>
          <span>02 / 停留</span>
          <span>03 / 表达</span>
        </div>
        <div className="welcome-corner">
          <span>LOCAL VISION LAB</span>
          <span>2026</span>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand-button" onClick={goHome} aria-label="返回首页">
          <span className="brand-mark small">
            <Icon name="eye" size={18} />
          </span>
          <span className="brand-text">
            <strong>目光所至</strong>
            <small>GAZE CANVAS</small>
          </span>
        </button>

        <div className="header-center">
          <span className={`status-dot ${status === 'ready' ? 'is-live' : ''}`} />
          <span>{demoMode ? '演示模式' : status === 'ready' ? '实时追踪' : status === 'loading' ? '模型加载中' : '摄像头待机'}</span>
          <span className="header-divider" />
          <span>{model ? '已校准' : '未校准'}</span>
        </div>

        <div className="header-actions">
          <button
            className={`header-button ${demoMode ? 'is-active' : ''}`}
            onClick={toggleDemo}
          >
            <Icon name="target" size={15} />
            {demoMode ? '退出演示' : '演示模式'}
          </button>
          <button
            className="header-button"
            onClick={openCalibration}
            disabled={demoMode || status !== 'ready'}
          >
            <Icon name="refresh" size={15} />
            校准
          </button>
        </div>
      </header>

      <main className="workspace">
        <div className="stage">
          <div className="mode-switch" role="tablist" aria-label="工作模式">
            <button
              className={mode === 'expression' ? 'is-active' : ''}
              onClick={() => setMode('expression')}
              data-gaze-target
              role="tab"
              aria-selected={mode === 'expression'}
            >
              <Icon name="grid" size={16} />
              表达板
            </button>
            <button
              className={mode === 'draw' ? 'is-active' : ''}
              onClick={() => setMode('draw')}
              data-gaze-target
              role="tab"
              aria-selected={mode === 'draw'}
            >
              <Icon name="brush" size={16} />
              绘画
            </button>
          </div>

          {mode === 'expression' ? (
            <ExpressionBoard
              selected={selectedPhrase}
              history={history}
              onSpeak={speak}
            />
          ) : (
            <DrawingCanvas
              cursor={cursor}
              demoMode={demoMode}
              onToast={showToast}
            />
          )}
        </div>

        <aside className="sidebar">
          <section className="panel camera-panel">
            <div className="panel-heading">
              <span className="eyebrow">LIVE EYE</span>
              <span className="live-label">
                <span className={`status-dot ${status === 'ready' ? 'is-live' : ''}`} />
                {demoMode ? 'POINTER' : status === 'ready' ? 'LIVE' : 'STANDBY'}
              </span>
            </div>
            <div className="camera-frame">
              <video
                ref={videoRef}
                className={`camera-video ${demoMode ? 'is-hidden' : ''}`}
                autoPlay
                muted
                playsInline
                aria-hidden="true"
              />
              <canvas
                ref={previewCanvasRef}
                className="landmark-canvas"
                width={640}
                height={480}
              />
              {demoMode && (
                <div className="camera-placeholder demo-placeholder">
                  <div className="demo-cursor" />
                  <strong>鼠标正在模拟目光</strong>
                  <span>移动鼠标，停留 0.8 秒选择</span>
                </div>
              )}
              {!demoMode && status === 'idle' && (
                <div className="camera-placeholder">
                  <Icon name="camera" size={24} />
                  <strong>摄像头待机</strong>
                  <span>从首页开启实时追踪</span>
                </div>
              )}
              {!demoMode && status === 'loading' && (
                <div className="camera-placeholder">
                  <span className="spinner" />
                  <strong>正在加载视觉模型</strong>
                  <span>首次启动需要几秒</span>
                </div>
              )}
              {!demoMode && status === 'error' && (
                <div className="camera-placeholder is-error">
                  <Icon name="eye" size={24} />
                  <strong>没有看到摄像头</strong>
                  <span>{error || '请检查权限后重试'}</span>
                </div>
              )}
              <div className="camera-scanline" />
              <div className="camera-corner tl" />
              <div className="camera-corner tr" />
              <div className="camera-corner bl" />
              <div className="camera-corner br" />
            </div>
            <div className="camera-footnote">
              <span>{gazeModelReady ? 'AI GAZE + IRIS' : 'IRIS + HEAD POSE'}</span>
              <span>{fps} FPS</span>
            </div>
          </section>

          <section className="panel calibration-card">
            <div className="panel-heading">
              <span className="eyebrow">CALIBRATION</span>
              <span className={`calibration-badge ${model ? 'is-ready' : ''}`}>
                {model ? 'READY' : 'NEEDED'}
              </span>
            </div>
            {demoMode ? (
              <p className="calibration-copy">
                演示模式使用鼠标位置模拟注视点。切换到摄像头后，完成九点校准即可使用真实目光。
              </p>
            ) : model ? (
              <>
                <p className="calibration-copy">
                  九点校准已完成，当前平均误差约{' '}
                  <strong>{(model.rmse * 100).toFixed(1)}%</strong>。
                </p>
                <button className="secondary-button full" onClick={openCalibration}>
                  <Icon name="refresh" size={15} />
                  重新校准
                </button>
              </>
            ) : (
              <>
                <p className="calibration-copy">
                  让目光与屏幕对齐。校准后，注视停留 0.8 秒就能选择。
                </p>
                <button
                  className="primary-button full"
                  onClick={openCalibration}
                  disabled={status !== 'ready'}
                >
                  <Icon name="target" size={15} />
                  {status === 'ready' ? '开始九点校准' : '等待摄像头'}
                </button>
              </>
            )}
          </section>

          <section className="panel telemetry-panel">
            <div className="panel-heading">
              <span className="eyebrow">SIGNAL</span>
              <span className="telemetry-time">{demoMode ? 'SIMULATED' : 'LIVE'}</span>
            </div>
            <div className="metric-grid">
              <div className="metric">
                <span>注视水平</span>
                <strong>{demoMode ? 'POINTER' : percent(gaze?.eyeX)}</strong>
                <div className="metric-bar"><span style={{ width: `${Math.min(100, Math.max(0, (gaze?.eyeX ?? 0.5) * 100))}%` }} /></div>
              </div>
              <div className="metric">
                <span>注视垂直</span>
                <strong>{demoMode ? 'POINTER' : percent(gaze?.eyeY)}</strong>
                <div className="metric-bar"><span style={{ width: `${Math.min(100, Math.max(0, (gaze?.eyeY ?? 0.5) * 100))}%` }} /></div>
              </div>
              <div className="metric">
                <span>置信度</span>
                <strong>{demoMode ? '100%' : percent(gaze?.confidence)}</strong>
                <div className="metric-bar accent"><span style={{ width: `${(gaze?.confidence ?? (demoMode ? 1 : 0)) * 100}%` }} /></div>
              </div>
              <div className="metric">
                <span>眨眼</span>
                <strong>{demoMode ? '—' : percent(gaze?.blink)}</strong>
                <div className="metric-bar warm"><span style={{ width: `${(gaze?.blink ?? 0) * 100}%` }} /></div>
              </div>
              <div className="metric">
                <span>AI 偏航</span>
                <strong>{demoMode ? '—' : degrees(gaze?.modelYaw)}</strong>
                <div className="metric-bar accent"><span style={{ width: `${Math.min(100, Math.abs(gaze?.modelYaw ?? 0) * 120)}%` }} /></div>
              </div>
              <div className="metric">
                <span>AI 俯仰</span>
                <strong>{demoMode ? '—' : degrees(gaze?.modelPitch)}</strong>
                <div className="metric-bar accent"><span style={{ width: `${Math.min(100, Math.abs(gaze?.modelPitch ?? 0) * 120)}%` }} /></div>
              </div>
            </div>
            <div className="telemetry-footer">
              <span>停留阈值</span>
              <strong>0.8 s</strong>
              <span className="telemetry-dot" />
              <span>{cursor?.source === 'pointer' ? '鼠标模拟' : '眼部追踪'}</span>
            </div>
          </section>

          <section className="guide-panel">
            <span className="eyebrow">HOW TO USE</span>
            <ol>
              <li><span>01</span>保持面部在右上角取景框内</li>
              <li><span>02</span>看住大按钮，等待环形进度完成</li>
              <li><span>03</span>移开目光即可取消选择</li>
            </ol>
          </section>
        </aside>
      </main>

      <footer className="app-footer">
        <span>LOCAL VISION / MEDIAPIPE + MPIIGAZE RESNET-8</span>
        <span>视频不会上传 · 仅保存在当前设备</span>
        <span className="footer-mark">目光所至 · 2026</span>
      </footer>

      <GazeCursor
        cursor={cursor}
        dwellProgress={dwellProgress}
        active={!calibrationOpen}
      />

      <CalibrationOverlay
        open={calibrationOpen}
        hasModel={Boolean(model)}
        collectPoint={collectCalibrationPoint}
        trainCalibration={trainCalibration}
        onFinish={handleCalibrationFinish}
        onClose={() => setCalibrationOpen(false)}
      />

      {toast && (
        <div className="toast" role="status">
          <Icon name="spark" size={16} />
          {toast}
        </div>
      )}
    </div>
  )
}

export default App
