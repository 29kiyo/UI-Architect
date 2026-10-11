import { getParentId, resolveNode, type Id, type Page } from '@/core'
import { unionRect } from './artboard'
import { moveKind } from './transform'
import type { WorldRect } from './viewport'

export type AlignKind = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export type Item = { id: Id; rect: WorldRect }
export type Delta = { id: Id; dx: number; dy: number }

// 整列・等間隔の対象: 2 つ以上で、全員が absolute / relative(座標で動かせる)でロックなし
export function alignEligible(page: Page, deviceId: Id, ids: readonly Id[]): boolean {
  if (ids.length < 2) return false
  return ids.every((id) => {
    const n = resolveNode(page, deviceId, id)
    const pid = getParentId(page, id)
    const p = pid ? resolveNode(page, deviceId, pid) : undefined
    if (!n || !p || n.locked) return false
    const k = moveKind(n.props.position.position, p.props.layout.display)
    return k === 'absolute' || k === 'offset'
  })
}

// 選択全体の外接矩形に揃える移動量(ワールド座標)
export function alignDeltas(items: Item[], kind: AlignKind): Delta[] {
  const u = unionRect(items.map((i) => i.rect))
  if (!u) return []
  return items.map(({ id, rect: r }) => {
    switch (kind) {
      case 'left':
        return { id, dx: u.x - r.x, dy: 0 }
      case 'right':
        return { id, dx: u.x + u.width - (r.x + r.width), dy: 0 }
      case 'hcenter':
        return { id, dx: u.x + u.width / 2 - (r.x + r.width / 2), dy: 0 }
      case 'top':
        return { id, dx: 0, dy: u.y - r.y }
      case 'bottom':
        return { id, dx: 0, dy: u.y + u.height - (r.y + r.height) }
      case 'vcenter':
        return { id, dx: 0, dy: u.y + u.height / 2 - (r.y + r.height / 2) }
    }
  })
}

// 3 つ以上。両端は動かさず、間隔を等しくする(間隔が負でも許容)
export function distributeDeltas(items: Item[], axis: 'x' | 'y'): Delta[] {
  if (items.length < 3) return []
  const start = (r: WorldRect) => (axis === 'x' ? r.x : r.y)
  const size = (r: WorldRect) => (axis === 'x' ? r.width : r.height)
  const sorted = [...items].sort((a, b) => start(a.rect) - start(b.rect))
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const span = start(last.rect) + size(last.rect) - start(first.rect)
  const total = sorted.reduce((s, i) => s + size(i.rect), 0)
  const gap = (span - total) / (sorted.length - 1)
  let cursor = start(first.rect)
  return sorted.map(({ id, rect }) => {
    const d = cursor - start(rect)
    cursor += size(rect) + gap
    return axis === 'x' ? { id, dx: d, dy: 0 } : { id, dx: 0, dy: d }
  })
}
