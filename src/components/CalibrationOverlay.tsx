import { useEffect, useRef, useState } from 'react'
import type { CalibrationModel, CalibrationSample } from '../lib/calibration'
import type { ScreenPoint } from '../lib/gazeTypes'
import { Icon } from './Icon'

const POINTS: ScreenPoint[] = [
  { x: 0.12, y: 0.16 },
  { x: 0.5, y: 0.12 },
  { x: 0.88, y: 0.16 },
  { x: 0.1, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.9, y: 0.5 },
  { x: 0.12, y: 0.84 },
  { x: 0.5, y: 0.88 },
  { x: 0.88, y: 0.84 },
]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const MIN_POINT_SAMPLES = 18

type Phase = 'intro' | 'settle' | 'collecting' | 'done' | 'error'

export function CalibrationOverlay({
  open,
  hasModel,
  faceVisible,
  collectPoint,
  trainCalibration,
  onFinish,
  onClose,
}: {
  open: boolean
  hasModel: boolean
  faceVisible: boolean
  collectPoint: (
    target: ScreenPoint,
    durationMs?: number,
  ) => Promise<CalibrationSample[]>
  trainCalibration: (samples: CalibrationSample[]) => CalibrationModel
  onFinish: (model: CalibrationModel) => void
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [step, setStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<CalibrationModel | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!open) return
    cancelledRef.current = false
    setPhase('intro')
    setStep(0)
    setProgress(0)
    setMessage('')
    setResult(null)
    return () => {
      cancelledRef.current = true
    }
  }, [open])

  if (!open) return null

  const start = async () => {
    if (!faceVisible) {
      setPhase('error')
      setMessage('没有检测到眼睛，请让面部和双眼出现在摄像头中再试')
      return
    }
    setPhase('settle')
    setMessage('')
    setProgress(0)
    const samples: CalibrationSample[] = []

    try {
      for (let index = 0; index < POINTS.length; index += 1) {
        if (cancelledRef.current) return
        setStep(index)
        setPhase('settle')
        await sleep(900)
        if (cancelledRef.current) return
        setPhase('collecting')
        const pointSamples = await collectPoint(POINTS[index], 2300)
        if (pointSamples.length < MIN_POINT_SAMPLES) {
          throw new Error(
            `第 ${index + 1} 个校准点没有检测到足够的眼部数据，请重新对准摄像头`,
          )
        }
        samples.push(...pointSamples)
        setProgress((index + 1) / POINTS.length)
        setMessage(`已采集 ${samples.length} 帧眼部数据`)
      }

      if (cancelledRef.current) return
      if (samples.length < POINTS.length * MIN_POINT_SAMPLES) {
        throw new Error('有效眼部样本不足，校准没有通过，请重新校准')
      }
      const model = trainCalibration(samples)
      setResult(model)
      setPhase('done')
      onFinish(model)
    } catch (caught) {
      setPhase('error')
      setMessage(
        caught instanceof Error ? caught.message : '校准失败，请重新尝试',
      )
    }
  }

  const point = POINTS[step]
  const collecting = phase === 'collecting'

  return (
    <div className="calibration-overlay" role="dialog" aria-modal="true">
      <div className="calibration-topbar">
        <div className="calibration-kicker">
          <span className="eyebrow">GAZE CALIBRATION</span>
          <strong>九点校准</strong>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="关闭校准">
          <Icon name="close" />
        </button>
      </div>

      {phase === 'intro' && (
        <div className="calibration-intro">
          <div className="calibration-orb">
            <span />
            <span />
            <span />
            <Icon name="eye" size={44} />
          </div>
          <span className="eyebrow">LOOK, THEN LET GO</span>
          <h2>{hasModel ? '重新认识你的目光' : '先让目光和屏幕对齐'}</h2>
          <p>
            接下来会出现 9 个发光点。请坐正，保持面部在摄像头中，依次注视每个点，
            不要移动头部。整个过程大约需要 30 秒。
          </p>
          <div className="calibration-tips">
            <span>保持光线均匀</span>
            <span>不要戴反光眼镜</span>
            <span>摄像头与视线齐平</span>
          </div>
          <div className={`eye-status ${faceVisible ? 'is-visible' : ''}`}>
            <span className="eye-status__dot" />
            {faceVisible ? '眼睛已检测到，可以开始' : '正在寻找眼睛，请正对摄像头'}
          </div>
          <button
            className="primary-button large"
            onClick={start}
            disabled={!faceVisible}
          >
            <Icon name="target" />
            {faceVisible ? '开始校准' : '等待眼睛出现'}
            <Icon name="arrow" />
          </button>
        </div>
      )}

      {(phase === 'settle' || phase === 'collecting') && (
        <>
          <div className="calibration-headline">
            <span className="eyebrow">POINT {step + 1} / 9</span>
            <h2>{collecting ? '保持注视，不要眨眼' : '看向发光点'}</h2>
            <p>{collecting ? '正在采集眼部特征…' : '准备好后，眼睛跟随光点移动'}</p>
          </div>
          <div
            className={`calibration-dot ${collecting ? 'is-collecting' : ''}`}
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          >
            <span className="calibration-dot__ring" />
            <span className="calibration-dot__core" />
          </div>
          <div className="calibration-progress">
            <div className="calibration-progress__track">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <p className={`calibration-status ${faceVisible ? 'is-visible' : ''}`}>
            {faceVisible ? '眼睛已检测到' : '未检测到眼睛，请重新对准摄像头'}
            {message ? ` · ${message}` : ''}
          </p>
        </>
      )}

      {phase === 'done' && result && (
        <div className="calibration-result">
          <div className="result-mark">
            <Icon name="check" size={36} />
          </div>
          <span className="eyebrow">CALIBRATION COMPLETE</span>
          <h2>目光已经对齐</h2>
          <p>现在可以用注视停留来选择按钮。建议先试一下表达板。</p>
          <div className="result-stats">
            <div>
              <strong>{(result.rmse * 100).toFixed(1)}%</strong>
              <span>平均误差</span>
            </div>
            <div>
              <strong>{result.sampleCount}</strong>
              <span>有效样本</span>
            </div>
            <div>
              <strong>9</strong>
              <span>校准点</span>
            </div>
          </div>
          <div className="calibration-actions">
            <button className="secondary-button" onClick={start}>
              <Icon name="refresh" />
              重新校准
            </button>
            <button className="primary-button" onClick={onClose}>
              进入工作台
              <Icon name="arrow" />
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="calibration-result">
          <div className="result-mark is-error">
            <Icon name="eye" size={34} />
          </div>
          <span className="eyebrow">CALIBRATION PAUSED</span>
          <h2>还没有看清你的目光</h2>
          <p>{message}</p>
          <div className="calibration-actions">
            <button className="secondary-button" onClick={onClose}>
              稍后再试
            </button>
            <button className="primary-button" onClick={start}>
              <Icon name="refresh" />
              重新校准
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
