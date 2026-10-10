import {
  PROP_GROUP_KEYS,
  type Id,
  type Node,
  type NodeOverride,
  type Page,
  type Props,
} from '../model'

export const getOverride = (page: Page, deviceId: Id, nodeId: Id): NodeOverride | undefined =>
  page.overrides[deviceId]?.[nodeId]

export const isDetached = (page: Page, deviceId: Id, nodeId: Id): boolean =>
  getOverride(page, deviceId, nodeId)?.detached === true

// 共有 props + propsDiff(キー単位)。detached なら propsDiff のみ。
export function resolveProps(base: Props, o: NodeOverride | undefined): Props {
  if (!o) return base
  const out = {} as Props
  for (const g of PROP_GROUP_KEYS) {
    const diff = o.propsDiff[g]
    out[g] = o.detached ? { ...diff } : diff ? { ...base[g], ...diff } : base[g]
  }
  return out
}

// order に載っている子を先頭に(存在しない ID は無視)、載っていない子は共有順で後ろに
export function orderChildren(children: Id[], order: Id[] | undefined): Id[] {
  if (!order) return children
  const present = new Set(children)
  const seen = new Set<Id>()
  const out: Id[] = []
  for (const id of order) {
    if (present.has(id) && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  for (const id of children) if (!seen.has(id)) out.push(id)
  return out
}

// デバイス別の実効ノード。override が無ければ共有ノードをそのまま返す。
export function resolveNode(page: Page, deviceId: Id, nodeId: Id): Node | undefined {
  const node = page.nodes[nodeId]
  const o = getOverride(page, deviceId, nodeId)
  if (!node || !o) return node
  return {
    ...node,
    props: resolveProps(node.props, o),
    hidden: o.hidden ?? node.hidden,
    children: orderChildren(node.children, o.order),
  }
}
