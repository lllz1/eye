import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { GazeFrame } from './gazeTypes'

type Landmark = { x: number; y: number; z?: number }

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const distance = (a: Landmark, b: Landmark) =>
  Math.hypot(a.x - b.x, a.y - b.y)

export type GazeDetection = {
  frame: GazeFrame
  landmarks: Landmark[]
}

export async function createGazeLandmarker(): Promise<FaceLandmarker> {
  const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: {
      modelAssetPath: '/models/face_landmarker.task',
      delegate,
    },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: 0.45,
    minFacePresenceConfidence: 0.45,
    minTrackingConfidence: 0.45,
  })

  try {
    return await FaceLandmarker.createFromOptions(vision, options('GPU'))
  } catch (error) {
    console.warn('GPU delegate unavailable, falling back to CPU', error)
    return FaceLandmarker.createFromOptions(vision, options('CPU'))
  }
}

function normalizedEye(
  iris: Landmark,
  outer: Landmark,
  inner: Landmark,
  top: Landmark,
  bottom: Landmark,
) {
  const centerX = (outer.x + inner.x) / 2
  const centerY = (top.y + bottom.y) / 2
  const width = Math.max(distance(outer, inner), 0.001)
  const height = Math.max(distance(top, bottom), 0.001)

  return {
    x: (iris.x - centerX) / width,
    y: (iris.y - centerY) / height,
    width,
    height,
  }
}

function readBlink(result: any): number {
  const categories = result.faceBlendshapes?.[0]?.categories as
    | Array<{ categoryName?: string; score?: number }>
    | undefined
  if (!categories) return 0

  const left = categories.find((item) => item.categoryName === 'eyeBlinkLeft')
  const right = categories.find((item) => item.categoryName === 'eyeBlinkRight')
  return Math.max(left?.score ?? 0, right?.score ?? 0)
}

export function detectGaze(
  landmarker: FaceLandmarker,
  video: HTMLVideoElement,
  timestamp: number,
): GazeDetection | null {
  const result = landmarker.detectForVideo(video, timestamp) as any
  const landmarks = result.faceLandmarks?.[0] as Landmark[] | undefined
  if (!landmarks || landmarks.length < 478) return null

  const leftIris = landmarks[468]
  const rightIris = landmarks[473]
  const leftOuter = landmarks[33]
  const leftInner = landmarks[133]
  const leftTop = landmarks[159]
  const leftBottom = landmarks[145]
  const rightInner = landmarks[362]
  const rightOuter = landmarks[263]
  const rightTop = landmarks[386]
  const rightBottom = landmarks[374]

  if (
    !leftIris ||
    !rightIris ||
    !leftOuter ||
    !leftInner ||
    !leftTop ||
    !leftBottom ||
    !rightInner ||
    !rightOuter ||
    !rightTop ||
    !rightBottom
  ) {
    return null
  }

  const left = normalizedEye(
    leftIris,
    leftOuter,
    leftInner,
    leftTop,
    leftBottom,
  )
  const right = normalizedEye(
    rightIris,
    rightOuter,
    rightInner,
    rightTop,
    rightBottom,
  )

  const eyeX = (left.x + right.x) / 2
  const eyeY = (left.y + right.y) / 2
  const leftCenter = {
    x: (leftOuter.x + leftInner.x) / 2,
    y: (leftOuter.y + leftInner.y) / 2,
  }
  const rightCenter = {
    x: (rightOuter.x + rightInner.x) / 2,
    y: (rightOuter.y + rightInner.y) / 2,
  }
  const eyeMid = {
    x: (leftCenter.x + rightCenter.x) / 2,
    y: (leftCenter.y + rightCenter.y) / 2,
  }
  const interocular = Math.max(distance(leftCenter, rightCenter), 0.001)
  const nose = landmarks[1] ?? eyeMid
  const yaw = (nose.x - eyeMid.x) / interocular
  const pitch = (nose.y - eyeMid.y) / interocular
  const headYaw = Math.atan2(nose.x - eyeMid.x, interocular)
  const headPitch = Math.atan2(nose.y - eyeMid.y, interocular)
  const roll = Math.atan2(
    rightCenter.y - leftCenter.y,
    rightCenter.x - leftCenter.x,
  )
  const ear =
    (left.height / Math.max(left.width, 0.001) +
      right.height / Math.max(right.width, 0.001)) /
    2
  const shapeBlink = clamp(1 - ear / 0.2, 0, 1)
  const blink = Math.max(shapeBlink, readBlink(result))
  const confidence = clamp(
    1 - Math.abs(yaw) * 0.22 - Math.abs(pitch) * 0.12 - blink * 0.35,
    0,
    1,
  )

  return {
    landmarks,
    frame: {
      eyeX,
      eyeY,
      faceX: nose.x,
      faceY: nose.y,
      yaw,
      pitch,
      roll,
      headYaw,
      headPitch,
      blink,
      ear,
      confidence,
      faceDetected: true,
      timestamp,
    },
  }
}
