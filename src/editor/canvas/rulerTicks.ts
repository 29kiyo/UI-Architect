// 1・2・5 × 10^n の「きりのよい」刻み(minWorld 以上で最小)
export function niceStep(minWorld: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(minWorld)))
  for (const m of [1, 2, 5, 10]) if (m * p >= minWorld) return m * p
  return 10 * p
}

// 画面 0〜span の範囲の目盛り(value=ワールド座標, screen=画面座標)
export function rulerTicks(
  zoom: number,
  pan: number,
  span = 2400,
  minPx = 60,
): { value: number; screen: number }[] {
  const step = niceStep(minPx / zoom)
  const w0 = (0 - pan) / zoom
  const w1 = (span - pan) / zoom
  const out: { value: number; screen: number }[] = []
  for (let v = Math.ceil(w0 / step) * step + 0; v <= w1; v += step) {
    out.push({ value: Math.round(v * 1000) / 1000, screen: v * zoom + pan })
  }
  return out
}
