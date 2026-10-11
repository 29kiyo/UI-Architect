import { createNode, newId, type Id, type Node, type NodeOverride, type Page } from '../model'
import { getDescendantIds, getParentId, removeNode, requireNode, walk } from './tree'

// ここの関数は immer の recipe 内(Command の apply)で呼ぶ。不正操作は throw。
type GenId = () => Id

export type NodeClipboard = {
  rootIds: Id[]
  nodes: Node[] // rootIds の各サブツリーを前順で並べたもの
  overrides: Record<Id, Record<Id, NodeOverride>> // deviceId → nodeId → override
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

// 選択の中から、他の選択の子孫でないものだけ(ルート除外・文書順)
export function topLevelIds(page: Page, ids: readonly Id[]): Id[] {
  const want = new Set(ids)
  const out: Id[] = []
  walk(page, (n) => {
    if (n.id !== page.rootNodeId && want.has(n.id)) {
      out.push(n.id)
      return false
    }
    return undefined
  })
  return out
}

export function copySubtrees(page: Page, ids: readonly Id[]): NodeClipboard {
  const rootIds = topLevelIds(page, ids)
  const nodes: Node[] = []
  for (const id of rootIds) {
    for (const nid of [id, ...getDescendantIds(page, id)]) nodes.push(clone(requireNode(page, nid)))
  }
  const have = new Set(nodes.map((n) => n.id))
  const overrides: NodeClipboard['overrides'] = {}
  for (const [dev, byNode] of Object.entries(page.overrides)) {
    for (const [nid, o] of Object.entries(byNode)) {
      if (have.has(nid)) (overrides[dev] ??= {})[nid] = clone(o)
    }
  }
  return { rootIds, nodes, overrides }
}

// ID を全部振り直して parent の index に挿入する。新しいルート ID 一覧を返す
export function pasteClipboard(
  page: Page,
  clip: NodeClipboard,
  parentId: Id,
  index?: number,
  gen: GenId = newId,
): Id[] {
  const parent = requireNode(page, parentId)
  const map = new Map(clip.nodes.map((n) => [n.id, gen()] as const))
  const mid = (id: Id): Id => map.get(id) ?? id
  for (const n of clip.nodes) {
    const c = clone(n)
    c.id = mid(n.id)
    c.children = c.children.map(mid)
    if (c.componentRef) {
      c.componentRef.slotContent = Object.fromEntries(
        Object.entries(c.componentRef.slotContent).map(([k, v]) => [k, v.map(mid)]),
      )
    }
    c.events = c.events.map((e) => ({
      ...e,
      id: gen(),
      actions: e.actions.map((a) => (a.type === 'showHide' ? { ...a, nodeId: mid(a.nodeId) } : a)),
    }))
    page.nodes[c.id] = c
  }
  const roots = clip.rootIds.map(mid)
  const at =
    index === undefined
      ? parent.children.length
      : Math.max(0, Math.min(index, parent.children.length))
  parent.children.splice(at, 0, ...roots)
  for (const [dev, byNode] of Object.entries(clip.overrides)) {
    for (const [nid, o] of Object.entries(byNode)) {
      const c = clone(o)
      if (c.order) c.order = c.order.map(mid)
      ;(page.overrides[dev] ??= {})[mid(nid)] = c
    }
  }
  return roots
}

// 元の直後に複製する。新しいルート ID 一覧を返す
export function duplicateNodes(page: Page, ids: readonly Id[], gen: GenId = newId): Id[] {
  const out: Id[] = []
  for (const id of topLevelIds(page, ids)) {
    const pid = getParentId(page, id)
    if (!pid) continue
    const parent = requireNode(page, pid)
    const created = pasteClipboard(
      page,
      copySubtrees(page, [id]),
      pid,
      parent.children.indexOf(id) + 1,
      gen,
    )
    for (const byNode of Object.values(page.overrides)) {
      const order = byNode[pid]?.order
      const i = order ? order.indexOf(id) : -1
      if (order && i >= 0) order.splice(i + 1, 0, ...created)
    }
    out.push(...created)
  }
  return out
}

// 子孫ごと削除(選択の入れ子は 1 回だけ)。削除した全 ID を返す
export function deleteNodes(page: Page, ids: readonly Id[]): Id[] {
  const out: Id[] = []
  for (const id of topLevelIds(page, ids)) out.push(...removeNode(page, id))
  return out
}

// 親の order override 内の from(最初の位置)を to に置き換える
function replaceInOrders(page: Page, parentId: Id, from: ReadonlySet<Id>, to: Id[]): void {
  for (const byNode of Object.values(page.overrides)) {
    const o = byNode[parentId]
    if (!o?.order) continue
    const idx = o.order.findIndex((x) => from.has(x))
    if (idx < 0) continue
    const before = o.order.slice(0, idx).filter((x) => !from.has(x)).length
    const rest = o.order.filter((x) => !from.has(x))
    rest.splice(before, 0, ...to)
    o.order = rest
  }
}

// 同じ親の兄弟をコンテナにまとめ、先頭の位置に置く。グループの ID を返す
export function groupNodes(page: Page, ids: readonly Id[], gen: GenId = newId): Id {
  const top = topLevelIds(page, ids)
  if (top.length === 0) throw new Error('groupNodes: nothing to group')
  const pid = getParentId(page, top[0]!)
  if (!pid || top.some((id) => getParentId(page, id) !== pid)) {
    throw new Error('groupNodes: nodes must share a parent')
  }
  const parent = requireNode(page, pid)
  const sel = new Set(top)
  const ordered = parent.children.filter((c) => sel.has(c))
  const group = createNode({ type: 'element', name: 'Group', id: gen(), children: ordered })
  const index = parent.children.findIndex((c) => sel.has(c))
  parent.children = parent.children.filter((c) => !sel.has(c))
  parent.children.splice(index, 0, group.id)
  page.nodes[group.id] = group
  replaceInOrders(page, pid, sel, [group.id])
  return group.id
}

// グループを解除して、子を元の位置に戻す。子の ID 一覧を返す
export function ungroupNode(page: Page, id: Id): Id[] {
  if (id === page.rootNodeId) throw new Error('cannot ungroup root node')
  const node = requireNode(page, id)
  const pid = getParentId(page, id)
  if (!pid) throw new Error(`node has no parent: ${id}`)
  const parent = requireNode(page, pid)
  const kids = [...node.children]
  const at = parent.children.indexOf(id)
  parent.children.splice(at, 1, ...kids)
  replaceInOrders(page, pid, new Set([id]), kids)
  delete page.nodes[id]
  for (const [dev, byNode] of Object.entries(page.overrides)) {
    delete byNode[id]
    if (Object.keys(byNode).length === 0) delete page.overrides[dev]
  }
  return kids
}

export type ZDir = 'front' | 'back' | 'forward' | 'backward'

// z 順 = 兄弟の並び順(後ろほど前面)。ids は同じ親の兄弟
export function zMove(order: readonly Id[], ids: readonly Id[], dir: ZDir): Id[] {
  const sel = new Set(ids.filter((i) => order.includes(i)))
  if (sel.size === 0) return [...order]
  const picked = order.filter((i) => sel.has(i))
  const rest = order.filter((i) => !sel.has(i))
  if (dir === 'front') return [...rest, ...picked]
  if (dir === 'back') return [...picked, ...rest]
  const out = [...order]
  if (dir === 'forward') {
    for (let i = out.length - 2; i >= 0; i--) {
      if (sel.has(out[i]!) && !sel.has(out[i + 1]!)) [out[i], out[i + 1]] = [out[i + 1]!, out[i]!]
    }
  } else {
    for (let i = 1; i < out.length; i++) {
      if (sel.has(out[i]!) && !sel.has(out[i - 1]!)) [out[i], out[i - 1]] = [out[i - 1]!, out[i]!]
    }
  }
  return out
}
