import type { Line } from './transform'
import type { Point, WorldRect } from './viewport'

export type SnapOptions = {
  threshold: number // ワールド単位(画面 px / zoom)
  gaps?: boolean | undefined // 等間隔スナップ(既定 true)
  // 吸着対象にする自分側の線(0=左/上, 0.5=中心, 1=右/下)。リサイズでは動かす辺だけを渡す
  lines?: { x?: readonly number[] | undefined; y?: readonly number[] | undefined } | undefined
}
export type SnapResult = { dx: number; dy: number; lines: Line[] }

type Axis = 'x' | 'y'
const other = (a: Axis): Axis => (a === 'x' ? 'y' : 'x')
const pos = (r: WorldRect, a: Axis) => (a === 'x' ? r.x : r.y)
const size = (r: WorldRect, a: Axis) => (a === 'x' ? r.width : r.height)
const end = (r: WorldRect, a: Axis) => pos(r, a) + size(r, a)
const overlaps = (a: WorldRect, b: WorldRect, axis: Axis) =>
  pos(a, axis) < end(b, axis) && end(a, axis) > pos(b, axis)
const contains = (a: WorldRect, b: WorldRect) =>
  a.x <= b.x && a.y <= b.y && a.x + a.width >= b.x + b.width && a.y + a.height >= b.y + b.height

const FRACS = [0, 0.5, 1] as const
const EPS = 0.5

// 等間隔の相手: 交差軸で重なり、自分を含まない(親・アートボードは除く)矩形
const peersOf = (moving: WorldRect, targets: WorldRect[], a: Axis) =>
  targets
    .filter((t) => overlaps(t, moving, other(a)) && !contains(t, moving))
    .sort((p, q) => pos(p, a) - pos(q, a))

// 1 軸分の補正量。しきい値内で最も近い候補(同距離なら 端 > 等間隔 > グリッド)
function axisSnap(
  moving: WorldRect,
  targets: WorldRect[],
  a: Axis,
  o: SnapOptions,
): number | undefined {
  const st = { d: 0, rank: 9, found: false }
  const offer = (d: number, rank: number) => {
    const ad = Math.abs(d)
    if (ad > o.threshold) return
    const bd = Math.abs(st.d)
    if (!st.found || ad < bd - 1e-9 || (ad <= bd + 1e-9 && rank < st.rank)) {
      st.d = d
      st.rank = rank
      st.found = true
    }
  }
  const mp = pos(moving, a)
  const ms = size(moving, a)
  for (const f of o.lines?.[a] ?? FRACS) {
    const ml = mp + f * ms
    for (const t of targets) {
      for (const tf of FRACS) offer(pos(t, a) + tf * size(t, a) - ml, 0)
    }
  }
  if (o.gaps !== false) {
    const peers = peersOf(moving, targets, a)
    for (let i = 0; i + 1 < peers.length; i++) {
      const A = peers[i]
      const B = peers[i + 1]
      if (!A || !B) continue
      const g = pos(B, a) - end(A, a)
      if (g <= EPS) continue
      offer(end(B, a) + g - mp, 1) // B の右に同じ間隔で
      offer(pos(A, a) - g - ms - mp, 1) // A の左に同じ間隔で
      if (g >= ms) offer((end(A, a) + pos(B, a) - ms) / 2 - mp, 1) // 2 つの間の中央
    }
  }
  return st.found ? st.d : undefined
}

// 吸着後の矩形に対して、一致している線(ガイド)と等間隔の区間を作る
function buildLines(final: WorldRect, targets: WorldRect[], o: SnapOptions): Line[] {
  const map = new Map<string, { a: Axis; at: number; lo: number; hi: number }>()
  for (const a of ['x', 'y'] as const) {
    const c = other(a)
    for (const f of o.lines?.[a] ?? FRACS) {
      const ml = pos(final, a) + f * size(final, a)
      for (const t of targets) {
        for (const tf of FRACS) {
          if (Math.abs(pos(t, a) + tf * size(t, a) - ml) >= EPS) continue
          const lo = Math.min(pos(final, c), pos(t, c))
          const hi = Math.max(end(final, c), end(t, c))
          const key = a + ':' + Math.round(ml * 2)
          const cur = map.get(key)
          if (cur) {
            cur.lo = Math.min(cur.lo, lo)
            cur.hi = Math.max(cur.hi, hi)
          } else map.set(key, { a, at: ml, lo, hi })
        }
      }
    }
  }
  const out: Line[] = [...map.values()].map(({ a, at, lo, hi }) =>
    a === 'x' ? { x1: at, y1: lo, x2: at, y2: hi } : { x1: lo, y1: at, x2: hi, y2: at },
  )
  if (o.gaps === false) return out
  for (const a of ['x', 'y'] as const) {
    const c = other(a)
    const items = [
      { r: final, m: true },
      ...peersOf(final, targets, a).map((r) => ({ r, m: false })),
    ].sort((p, q) => pos(p.r, a) - pos(q.r, a))
    const gaps: { A: WorldRect; B: WorldRect; g: number; m: boolean }[] = []
    for (let i = 0; i + 1 < items.length; i++) {
      const A = items[i]
      const B = items[i + 1]
      if (!A || !B) continue
      const g = pos(B.r, a) - end(A.r, a)
      if (g > EPS) gaps.push({ A: A.r, B: B.r, g, m: A.m || B.m })
    }
    gaps.forEach((gp, i) => {
      const hit = gaps.some((g2, j) => j !== i && Math.abs(g2.g - gp.g) < EPS && (gp.m || g2.m))
      if (!hit) return
      const mid = (Math.max(pos(gp.A, c), pos(gp.B, c)) + Math.min(end(gp.A, c), end(gp.B, c))) / 2
      out.push(
        a === 'x'
          ? { x1: end(gp.A, a), y1: mid, x2: pos(gp.B, a), y2: mid }
          : { x1: mid, y1: end(gp.A, a), x2: mid, y2: pos(gp.B, a) },
      )
    })
  }
  return out
}

// moving(ドラッグ後の位置の矩形)を targets に吸着させる補正量とガイド線
export function snapRect(moving: WorldRect, targets: WorldRect[], o: SnapOptions): SnapResult {
  const dx = axisSnap(moving, targets, 'x', o) ?? 0
  const m2 = { ...moving, x: moving.x + dx }
  const dy = axisSnap(m2, targets, 'y', o) ?? 0
  const final = { ...m2, y: m2.y + dy }
  return { dx, dy, lines: buildLines(final, targets, o) }
}
