// 専用エディタの編集操作(UI 非依存の純関数)
import type { GradientStop, LinearGradient, Shadow, TransformParts } from './values'

export const DEFAULT_SHADOW: Shadow = {
  inset: false,
  x: 0,
  y: 2,
  blur: 4,
  spread: 0,
  color: 'rgba(0, 0, 0, 0.25)',
}

export const addShadow = (list: Shadow[]): Shadow[] => [...list, { ...DEFAULT_SHADOW }]

export const removeAt = <T>(list: T[], i: number): T[] => list.filter((_, k) => k !== i)

export const updateAt = <T>(list: T[], i: number, patch: Partial<T>): T[] =>
  list.map((x, k) => (k === i ? { ...x, ...patch } : x))

// blur / spread は負にしない(CSS では blur の負値が無効)
export function clampShadow(s: Shadow): Shadow {
  return { ...s, blur: Math.max(0, s.blur) }
}

export const MIN_STOPS = 2

export function addStop(g: LinearGradient): LinearGradient {
  const last = g.stops[g.stops.length - 1]
  const stop: GradientStop = { color: last?.color ?? '#000000', pos: 100 }
  return { ...g, stops: [...g.stops, stop] }
}

// 2 個未満にはならない
export function removeStop(g: LinearGradient, i: number): LinearGradient {
  return g.stops.length <= MIN_STOPS ? g : { ...g, stops: removeAt(g.stops, i) }
}

export function updateStop(
  g: LinearGradient,
  i: number,
  patch: Partial<GradientStop>,
): LinearGradient {
  return { ...g, stops: updateAt(g.stops, i, patch) }
}

export const DEFAULT_GRADIENT: LinearGradient = {
  angle: 90,
  stops: [
    { color: '#ffffff', pos: 0 },
    { color: '#000000', pos: 100 },
  ],
}

export function setTransformPart(
  t: TransformParts,
  key: keyof TransformParts,
  value: number,
): TransformParts {
  return Number.isFinite(value) ? { ...t, [key]: value } : t
}
