import * as ort from 'onnxruntime-web/wasm'
import type { GazeFrame } from './gazeTypes'

type Landmark = { x: number; y: number }

export type ModelGaze = {
  pitch: number
  yaw: number
  confidence: number
}

let sessionPromise: Promise<ort.InferenceSession> | null = null

const EYE_W = 60
const EYE_H = 36

export async function loadGazeModel(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    ort.env.wasm.wasmPaths = '/ort/'
    ort.env.wasm.numThreads = 1
    sessionPromise = ort.InferenceSession.create('/models/gaze_resnet8.onnx', {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    })
  }
  return sessionPromise
}

function eyePatch(
  video: HTMLVideoElement,
  landmarks: Landmark[],
  irisIndex: number,
  outerIndex: number,
  innerIndex: number,
  topIndex: number,
  bottomIndex: number,
  flip: boolean,
): Float32Array | null {
  const iris = landmarks[irisIndex]
  const outer = landmarks[outerIndex]
  const inner = landmarks[innerIndex]
  const top = landmarks[topIndex]
  const bottom = landmarks[bottomIndex]
  if (!iris || !outer || !inner || !top || !bottom) return null

  const width = Math.max(
    Math.hypot((inner.x - outer.x) * video.videoWidth, (inner.y - outer.y) * video.videoHeight),
    8,
  )
  const eyeCenterX = ((outer.x + inner.x) / 2) * video.videoWidth
  const eyeCenterY = ((top.y + bottom.y) / 2) * video.videoHeight
  const boxW = width * 1.9
  const boxH = boxW * (EYE_H / EYE_W)
  const sx = Math.max(0, eyeCenterX - boxW / 2)
  const sy = Math.max(0, eyeCenterY - boxH / 2)
  const sw = Math.min(video.videoWidth - sx, boxW)
  const sh = Math.min(video.videoHeight - sy, boxH)
  if (sw <= 0 || sh <= 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = EYE_W
  canvas.height = EYE_H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, EYE_W, EYE_H)
  if (flip) {
    ctx.translate(EYE_W, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, EYE_W, EYE_H)
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  const image = ctx.getImageData(0, 0, EYE_W, EYE_H)
  const gray = new Uint8Array(EYE_W * EYE_H)
  const histogram = new Uint32Array(256)
  for (let i = 0; i < gray.length; i += 1) {
    const offset = i * 4
    const value = Math.round(
      image.data[offset] * 0.299 +
        image.data[offset + 1] * 0.587 +
        image.data[offset + 2] * 0.114,
    )
    gray[i] = value
    histogram[value] += 1
  }

  let total = 0
  for (let i = 0; i < 256; i += 1) total += histogram[i]
  const cdf = new Uint32Array(256)
  let running = 0
  for (let i = 0; i < 256; i += 1) {
    running += histogram[i]
    cdf[i] = Math.round((running / Math.max(total, 1)) * 255)
  }
  const output = new Float32Array(gray.length)
  for (let i = 0; i < gray.length; i += 1) {
    output[i] = cdf[gray[i]] / 255
  }
  return output
}

export async function predictModelGaze(
  session: ort.InferenceSession,
  video: HTMLVideoElement,
  landmarks: Landmark[],
  frame: GazeFrame,
): Promise<ModelGaze | null> {
  if (video.readyState < 2) return null
  const left = eyePatch(video, landmarks, 468, 33, 133, 159, 145, false)
  const right = eyePatch(video, landmarks, 473, 263, 362, 386, 374, true)
  if (!left && !right) return null

  const patches = [left, right].filter(Boolean) as Float32Array[]
  const eyeData = new Float32Array(patches.length * EYE_W * EYE_H)
  patches.forEach((patch, index) => eyeData.set(patch, index * EYE_W * EYE_H))
  const poseData = new Float32Array(patches.length * 2)
  for (let i = 0; i < patches.length; i += 1) {
    poseData[i * 2] = frame.headPitch
    poseData[i * 2 + 1] = frame.headYaw
  }

  const eyeTensor = new ort.Tensor('float32', eyeData, [patches.length, 1, EYE_H, EYE_W])
  const poseTensor = new ort.Tensor('float32', poseData, [patches.length, 2])
  const output = await session.run({ eye: eyeTensor, pose: poseTensor })
  const values = output.gaze.data as Float32Array
  if (values.length < patches.length * 2) return null

  let pitch = 0
  let yaw = 0
  for (let i = 0; i < patches.length; i += 1) {
    pitch += values[i * 2]
    yaw += values[i * 2 + 1]
  }
  pitch /= patches.length
  yaw /= patches.length

  let disagreement = 0
  if (patches.length === 2) {
    disagreement =
      Math.abs(values[0] - values[2]) + Math.abs(values[1] - values[3])
  }
  const confidence = Math.max(
    0.15,
    Math.min(1, frame.confidence * (1 - Math.min(0.7, disagreement * 0.8))),
  )
  return { pitch, yaw, confidence }
}
