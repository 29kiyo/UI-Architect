import { getDescendantIds, getParentId, resolveNode, type Id, type Node, type Page } from '@/core'
import { canContain } from './palette'

export type LayerRow = {
  id: Id
  depth: number
  node: Node
  hasChildren: boolean
  collapsed: boolean
}

const MAX_DEPTH = 200

// ルート直下からの行一覧(デバイス別の並び順)。検索中は一致+その祖先だけを開いて表示する
export function buildRows(
  page: Page,
  deviceId: Id,
  collapsed: ReadonlySet<Id>,
  query: string,
): LayerRow[] {
  const q = query.trim().toLowerCase()
  const match = (n: Node) => [n.name, n.type, n.category].some((s) => s.toLowerCase().includes(q))
  const seen = new Set<Id>()
  const rec = (id: Id, depth: number): LayerRow[] => {
    if (seen.has(id) || depth > MAX_DEPTH) return []
    seen.add(id)
    const n = resolveNode(page, deviceId, id)
    if (!n) return []
    const isCollapsed = !q && collapsed.has(id)
    const kids = isCollapsed ? [] : n.children.flatMap((c) => rec(c, depth + 1))
    if (q && !match(n) && kids.length === 0) return []
    return [
      { id, depth, node: n, hasChildren: n.children.length > 0, collapsed: isCollapsed },
      ...kids,
    ]
  }
  const root = resolveNode(page, deviceId, page.rootNodeId)
  return (root?.children ?? []).flatMap((c) => rec(c, 0))
}

export type DropPos = 'before' | 'after' | 'inside'

// 行の上 1/4 = 前、下 1/4 = 後ろ、中央 = 子に入れる(入れられない行は上下半分)
export function dropPosition(offsetY: number, height: number, canInside: boolean): DropPos {
  const r = height > 0 ? offsetY / height : 0.5
  if (canInside) return r < 0.25 ? 'before' : r > 0.75 ? 'after' : 'inside'
  return r < 0.5 ? 'before' : 'after'
}

// ドロップ先の (親, この兄弟の前)。不正(自分/子孫の中・ルート・入れられない親)は undefined
export function resolveDrop(
  page: Page,
  deviceId: Id,
  dragId: Id,
  targetId: Id,
  pos: DropPos,
): { parentId: Id; beforeId: Id | undefined } | undefined {
  if (dragId === targetId || dragId === page.rootNodeId) return undefined
  const drag = page.nodes[dragId]
  if (!drag || !page.nodes[targetId]) return undefined
  if (getDescendantIds(page, dragId).includes(targetId)) return undefined
  const parentId = pos === 'inside' ? targetId : getParentId(page, targetId)
  if (!parentId) return undefined
  const parent = page.nodes[parentId]
  const resolved = resolveNode(page, deviceId, parentId)
  if (!parent || !resolved) return undefined
  if (getParentId(page, dragId) !== parentId && !canContain(parent, drag.category)) return undefined
  const sibs = resolved.children.filter((c) => c !== dragId)
  const beforeId =
    pos === 'inside' ? undefined : pos === 'before' ? targetId : sibs[sibs.indexOf(targetId) + 1]
  return { parentId, beforeId }
}
