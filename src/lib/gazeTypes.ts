export type GazeFrame = {
  eyeX: number
  eyeY: number
  faceX: number
  faceY: number
  yaw: number
  pitch: number
  roll: number
  headYaw: number
  headPitch: number
  modelYaw?: number
  modelPitch?: number
  modelConfidence?: number
  blink: number
  ear: number
  confidence: number
  faceDetected: boolean
  timestamp: number
}

export type ScreenPoint = {
  x: number
  y: number
}

export type CursorState = {
  x: number
  y: number
  confidence: number
  source: 'gaze' | 'pointer'
}
