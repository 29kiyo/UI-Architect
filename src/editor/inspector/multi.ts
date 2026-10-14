import { resolveNode, type Id, type Node, type Page } from '@/core'
import type { PropWrite } from '../canvas/commands'
import type { PropDef } from './registry'

// 複数選択の一括編集用(UI 非依存の純ロジック)

export const appliesTo = (def: PropDef, node: Pick<Node, 'category'>): boolean =>
  def.appliesTo === undefined || def.appliesTo.includes(node.category)

// 存在しない ID は無視する
export function resolveSelected(page: Page, deviceId: Id, ids: Id[]): Node[] {
  return ids.flatMap((id) => {
    const n = resolveNode(page, deviceId, id)
    return n ? [n] : []
  })
}

export const applicableNodes = (nodes: Node[], def: PropDef): Node[] =>
  nodes.filter((n) => appliesTo(def, n))

export type Shown = { mixed: boolean; value: unknown }

const keyOf = (v: unknown): string => JSON.stringify(v) ?? 'undefined'

// 適用対象ノードの実効値がすべて同じなら value、違えば mixed
export function shownValue(nodes: Node[], def: PropDef): Shown {
  const vals = applicableNodes(nodes, def).map((n) => n.props[def.group][def.key])
  const first = vals[0]
  const mixed = vals.some((v) => keyOf(v) !== keyOf(first))
  return { mixed, value: mixed ? undefined : first }
}

export function writesFor(nodes: Node[], def: PropDef, value: string | number): PropWrite[] {
  return applicableNodes(nodes, def).map((n) => ({
    nodeId: n.id,
    group: def.group,
    key: def.key,
    value,
  }))
}
