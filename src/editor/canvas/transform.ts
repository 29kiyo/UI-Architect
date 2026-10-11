import type { Id } from '@/core'
import type { Point, WorldRect } from './viewport'

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const HANDLE_IDS: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const SIGN: Record<HandleId, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
}
export const HANDLE_CURSOR: Record<HandleId, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}
export const isHandleId = (s: string): s is HandleId => (HANDLE_IDS as string[]).includes(s)
export const handleSigns = (h: HandleId): [number, number] => SIGN[h]

export function handlePoint(r: WorldRect, h: HandleId): Point {
  const [sx, sy] = SIGN[h]
  return { x: r.x + ((sx + 1) / 2) * r.width, y: r.y + ((sy + 1) / 2) * r.height }
}

export type ResizeOptions = { keepRatio?: boolean; fromCenter?: boolean; minSize?: number }

// start 矩形をハンドルごとに d(ワールド座標の移動量)だけ変形する
export function resizeRect(
  start: WorldRect,
  handle: HandleId,
  d: Point,
  o: ResizeOptions = {},
): WorldRect {
  const [sx, sy] = SIGN[handle]
  const min = o.minSize ?? 1
  const k = o.fromCenter ? 2 : 1
  let w = Math.max(min, start.width + sx * d.x * k)
  let h = Math.max(min, start.height + sy * d.y * k)
  if (o.keepRatio && start.width > 0 && start.height > 0) {
    const r = start.width / start.height
    if (sx === 0) w = h * r
    else if (sy === 0) h = w / r
    else {
      const s = Math.max(w / start.width, h / start.height)
      w = start.width * s
      h = start.height * s
    }
    w = Math.max(min, w)
    h = Math.max(min, h)
  }
  const cx = start.x + start.width / 2
  const cy = start.y + start.height / 2
  const x = o.fromCenter || sx === 0 ? cx - w / 2 : sx < 0 ? start.x + start.width - w : start.x
  const y = o.fromCenter || sy === 0 ? cy - h / 2 : sy < 0 ? start.y + start.height - h : start.y
  return { x, y, width: w, height: h }
}

// ---- 移動の種別 ----
export type MoveKind = 'absolute' | 'offset' | 'reorder' | 'none'

export function moveKind(position: unknown, parentDisplay: unknown): MoveKind {
  if (position === 'absolute' || position === 'fixed') return 'absolute'
  if (typeof parentDisplay === 'string' && /^(inline-)?(flex|grid)$/.test(parentDisplay)) {
    return 'reorder'
  }
  return position === 'relative' ? 'offset' : 'none'
}

export function flexAxis(layout: Record<string, unknown>): 'x' | 'y' {
  const dir = layout.flexDirection
  return layout.display !== 'grid' && typeof dir === 'string' && dir.startsWith('column')
    ? 'y'
    : 'x'
}

export function parsePx(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string') return undefined
  const m = /^\s*(-?\d+(?:\.\d+)?)(?:px)?\s*$/.exec(v)
  return m ? Number(m[1]) : undefined
}

// ---- 並び替え ----
export type Sibling = { id: Id; rect: WorldRect }
export type Line = { x1: number; y1: number; x2: number; y2: number }

// ポインタに最も近い兄弟の前/後ろへ挿入する。beforeId が undefined なら末尾
export function reorderTarget(
  others: Sibling[],
  p: Point,
  axis: 'x' | 'y',
): { beforeId: Id | undefined; line: Line | undefined } {
  let best = -1
  let bestD = Infinity
  others.forEach((s, i) => {
    const d = Math.hypot(p.x - (s.rect.x + s.rect.width / 2), p.y - (s.rect.y + s.rect.height / 2))
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  const s = others[best]
  if (!s) return { beforeId: undefined, line: undefined }
  const r = s.rect
  const after = axis === 'x' ? p.x > r.x + r.width / 2 : p.y > r.y + r.height / 2
  const beforeId = after ? others[best + 1]?.id : s.id
  const line: Line =
    axis === 'x'
      ? {
          x1: after ? r.x + r.width : r.x,
          y1: r.y,
          x2: after ? r.x + r.width : r.x,
          y2: r.y + r.height,
        }
      : {
          x1: r.x,
          y1: after ? r.y + r.height : r.y,
          x2: r.x + r.width,
          y2: after ? r.y + r.height : r.y,
        }
  return { beforeId, line }
}

export function applyReorder(order: Id[], id: Id, beforeId: Id | undefined): Id[] {
  const rest = order.filter((x) => x !== id)
  const i = beforeId === undefined ? rest.length : rest.indexOf(beforeId)
  const at = i < 0 ? rest.length : i
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}

// ---- 回転 ----
const ROTATE_RE = /rotate\(\s*(-?\d*\.?\d+)\s*(deg|rad|turn|grad)?\s*\)/i

export const angleDeg = (c: Point, p: Point): number =>
  (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI

// (-180, 180) に正規化
export const normalizeAngle = (a: number): number => ((((a + 180) % 360) + 360) % 360) - 180

export function getRotation(transform: string): number {
  const m = ROTATE_RE.exec(transform)
  if (!m) return 0
  const v = Number(m[1] ?? 0)
  const u = (m[2] ?? 'deg').toLowerCase()
  const deg =
    u === 'rad' ? (v * 180) / Math.PI : u === 'turn' ? v * 360 : u === 'grad' ? v * 0.9 : v
  return Math.round(deg * 100) / 100
}

// transform 文字列の rotate() だけを差し替える(他の関数は保持。無ければ末尾に追加)
export function setRotation(transform: string, deg: number): string {
  const base = transform.trim() === 'none' ? '' : transform
  const fn = deg === 0 ? '' : `rotate(${deg}deg)`
  const out = ROTATE_RE.test(base) ? base.replace(ROTATE_RE, fn) : fn ? `${base} ${fn}` : base
  return out.replace(/\s+/g, ' ').trim()
}
