export class OneEuroFilter {
  private readonly minCutoff: number
  private readonly beta: number
  private readonly dCutoff: number
  private xPrev: number | null = null
  private dxPrev = 0
  private tPrev: number | null = null

  constructor(minCutoff = 1.2, beta = 0.008, dCutoff = 1.0) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
  }

  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  filter(value: number, timestamp: number): number {
    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = value
      this.tPrev = timestamp
      return value
    }

    const dt = Math.max((timestamp - this.tPrev) / 1000, 1 / 240)
    const dx = (value - this.xPrev) / dt
    const alphaD = this.alpha(this.dCutoff, dt)
    const dxHat = this.dxPrev + alphaD * (dx - this.dxPrev)
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat)
    const alpha = this.alpha(cutoff, dt)
    const filtered = this.xPrev + alpha * (value - this.xPrev)

    this.xPrev = filtered
    this.dxPrev = dxHat
    this.tPrev = timestamp
    return filtered
  }

  reset() {
    this.xPrev = null
    this.dxPrev = 0
    this.tPrev = null
  }
}
