import type { GazeFrame } from './gazeTypes'

export type CalibrationSample = {
  features: number[]
  targetX: number
  targetY: number
}

export type CalibrationModel = {
  coefX: number[]
  coefY: number[]
  rmse: number
  sampleCount: number
  createdAt: number
}

export const FEATURE_COUNT = 13
export const CALIBRATION_STORAGE_KEY = 'gaze-canvas-calibration-v3'

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export function buildFeatureVector(frame: GazeFrame): number[] {
  const gx = (frame.eyeX - 0.5) * 2
  const gy = (frame.eyeY - 0.5) * 2
  const hx = (frame.faceX - 0.5) * 2
  const hy = (frame.faceY - 0.5) * 2

  return [
    1,
    gx,
    gy,
    gx * gx,
    gx * gy,
    gy * gy,
    hx,
    hy,
    frame.yaw * 4,
    frame.pitch * 4,
    frame.roll * 4,
    (frame.modelYaw ?? 0) * 4,
    (frame.modelPitch ?? 0) * 4,
  ]
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const n = vector.length
  const a = matrix.map((row) => row.slice())
  const b = vector.slice()

  for (let column = 0; column < n; column += 1) {
    let pivot = column
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row
    }

    if (Math.abs(a[pivot][column]) < 1e-9) {
      throw new Error('校准数据不够稳定，请重新校准')
    }

    ;[a[column], a[pivot]] = [a[pivot], a[column]]
    ;[b[column], b[pivot]] = [b[pivot], b[column]]

    const divisor = a[column][column]
    for (let col = column; col < n; col += 1) a[column][col] /= divisor
    b[column] /= divisor

    for (let row = 0; row < n; row += 1) {
      if (row === column) continue
      const factor = a[row][column]
      if (Math.abs(factor) < 1e-12) continue
      for (let col = column; col < n; col += 1) {
        a[row][col] -= factor * a[column][col]
      }
      b[row] -= factor * b[column]
    }
  }

  return b
}

function ridgeRegression(x: number[][], y: number[], lambda = 0.025): number[] {
  const n = x[0].length
  const ata = Array.from({ length: n }, () => Array<number>(n).fill(0))
  const aty = Array<number>(n).fill(0)

  for (let row = 0; row < x.length; row += 1) {
    for (let i = 0; i < n; i += 1) {
      aty[i] += x[row][i] * y[row]
      for (let j = 0; j < n; j += 1) {
        ata[i][j] += x[row][i] * x[row][j]
      }
    }
  }

  for (let i = 0; i < n; i += 1) {
    ata[i][i] += lambda * (i === 0 ? 0.01 : 1)
  }

  return solveLinearSystem(ata, aty)
}

export function fitCalibration(samples: CalibrationSample[]): CalibrationModel {
  const clean = samples.filter((sample) => {
    return (
      sample.features.length === FEATURE_COUNT &&
      sample.features.every(Number.isFinite) &&
      Number.isFinite(sample.targetX) &&
      Number.isFinite(sample.targetY)
    )
  })

  if (clean.length < 24) {
    throw new Error('校准样本不足，请保持面部出现在摄像头中并重新校准')
  }

  const x = clean.map((sample) => sample.features)
  const coefX = ridgeRegression(x, clean.map((sample) => sample.targetX))
  const coefY = ridgeRegression(x, clean.map((sample) => sample.targetY))

  let squaredError = 0
  for (const sample of clean) {
    const predictedX = dot(coefX, sample.features)
    const predictedY = dot(coefY, sample.features)
    squaredError +=
      (predictedX - sample.targetX) ** 2 + (predictedY - sample.targetY) ** 2
  }

  return {
    coefX,
    coefY,
    rmse: Math.sqrt(squaredError / (clean.length * 2)),
    sampleCount: clean.length,
    createdAt: Date.now(),
  }
}

function dot(a: number[], b: number[]) {
  let value = 0
  for (let i = 0; i < a.length; i += 1) value += a[i] * b[i]
  return value
}

export function predictCalibration(
  model: CalibrationModel,
  features: number[],
): { x: number; y: number } {
  return {
    x: clamp01(dot(model.coefX, features)),
    y: clamp01(dot(model.coefY, features)),
  }
}

export function saveCalibration(model: CalibrationModel) {
  localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(model))
}

export function loadCalibration(): CalibrationModel | null {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY)
    if (!raw) return null
    const model = JSON.parse(raw) as CalibrationModel
    if (
      !Array.isArray(model.coefX) ||
      !Array.isArray(model.coefY) ||
      model.coefX.length !== FEATURE_COUNT ||
      model.coefY.length !== FEATURE_COUNT
    ) {
      return null
    }
    return model
  } catch {
    return null
  }
}

export function clearStoredCalibration() {
  localStorage.removeItem(CALIBRATION_STORAGE_KEY)
}
