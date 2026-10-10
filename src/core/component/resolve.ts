import type { Id, InstanceOverride, Node, UIDocument } from '../model'
import { resolveProps } from '../device'

export type ResolvedInstance = {
  rootNodeId: Id
  // 定義内ノード(ID は定義側のもの)。スロットノードの children は、インスタンスの子(ページ側ノード)の ID
  nodes: Record<Id, Node>
}

function apply(node: Node, o: InstanceOverride | undefined): Node {
  if (!o) return node
  return {
    ...node,
    props: resolveProps(node.props, { propsDiff: o.propsDiff, hidden: o.hidden, detached: false }),
    hidden: o.hidden ?? node.hidden,
  }
}

// 定義 → バリアント上書き → インスタンス上書き の順に適用した実効ノード群。
// 参照先の定義が無い / インスタンスでない場合は undefined。
export function resolveInstance(doc: UIDocument, instance: Node): ResolvedInstance | undefined {
  const ref = instance.componentRef
  if (!ref) return undefined
  const def = doc.components.find((c) => c.id === ref.componentId)
  if (!def) return undefined
  const variant = ref.variantId ? def.variants.find((v) => v.id === ref.variantId) : undefined
  const slotOf = new Map(def.slots.map((s) => [s.nodeId, s.id]))
  const nodes: Record<Id, Node> = {}
  for (const [id, base] of Object.entries(def.nodes)) {
    let node = apply(apply(base, variant?.overrides[id]), ref.overrides[id])
    const slotId = slotOf.get(id)
    if (slotId) {
      const content = ref.slotContent[slotId]
      // インスタンスの子でなくなった ID は除外する
      node = {
        ...node,
        children: content ? content.filter((c) => instance.children.includes(c)) : node.children,
      }
    }
    nodes[id] = node
  }
  return { rootNodeId: def.rootNodeId, nodes }
}
