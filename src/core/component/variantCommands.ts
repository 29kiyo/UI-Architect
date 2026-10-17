import type { Command } from '../history'
import { allPages } from '../master'
import type {
  ComponentDef,
  ComponentVariant,
  Id,
  Node,
  PropGroup,
  Props,
  UIDocument,
} from '../model'
import { addNode, removeNode, requireNode } from '../store'
import { addVariant, setInstanceVariant, setVariantProp } from './ops'

function defOf(d: UIDocument, id: Id): ComponentDef {
  const def = d.components.find((c) => c.id === id)
  if (!def) throw new Error(`component not found: ${id}`)
  return def
}

function pageOf(d: UIDocument, id: Id) {
  const p = allPages(d).find((x) => x.id === id)
  if (!p) throw new Error(`page not found: ${id}`)
  return p
}

// ---- バリアント ----

export const createAddVariantCommand = (componentId: Id, variant: ComponentVariant): Command => ({
  name: 'add variant',
  apply: (d) => addVariant(d, componentId, structuredClone(variant)),
})

export const createRenameVariantCommand = (
  componentId: Id,
  variantId: Id,
  name: string,
): Command => ({
  name: 'rename variant',
  apply: (d) => {
    const n = name.trim()
    if (!n) throw new Error('バリアント名が空です')
    const v = defOf(d, componentId).variants.find((x) => x.id === variantId)
    if (!v) throw new Error(`variant not found: ${variantId}`)
    v.name = n
  },
})

// 削除すると、そのバリアントを選んでいたインスタンスは「なし」に戻る
export const createRemoveVariantCommand = (componentId: Id, variantId: Id): Command => ({
  name: 'remove variant',
  apply: (d) => {
    const def = defOf(d, componentId)
    const i = def.variants.findIndex((v) => v.id === variantId)
    if (i < 0) throw new Error(`variant not found: ${variantId}`)
    def.variants.splice(i, 1)
    for (const p of allPages(d)) {
      for (const n of Object.values(p.nodes)) {
        const r = n.componentRef
        if (r && r.componentId === componentId && r.variantId === variantId) delete r.variantId
      }
    }
  },
})

type VariantTarget = { componentId: Id; variantId: Id; nodeId: Id }

export const createSetVariantPropCommand = (
  o: VariantTarget & {
    group: keyof Props
    key: string
    value: PropGroup[string]
    coalesceKey?: string | undefined
  },
): Command => ({
  name: 'variant prop',
  ...(o.coalesceKey ? { coalesceKey: o.coalesceKey } : {}),
  apply: (d) => setVariantProp(d, o.componentId, o.variantId, o.nodeId, o.group, o.key, o.value),
})

// group / key を省くほど範囲が広い(ノード全体 / グループ / 項目)
export const createResetVariantPropCommand = (
  o: VariantTarget & { group?: keyof Props | undefined; key?: string | undefined },
): Command => ({
  name: 'reset variant prop',
  apply: (d) => {
    const v = defOf(d, o.componentId).variants.find((x) => x.id === o.variantId)
    const ov = v?.overrides[o.nodeId]
    if (!v || !ov) return
    if (o.group === undefined) {
      delete v.overrides[o.nodeId]
      return
    }
    const g = ov.propsDiff[o.group]
    if (g) {
      if (o.key === undefined) delete ov.propsDiff[o.group]
      else {
        delete g[o.key]
        if (Object.keys(g).length === 0) delete ov.propsDiff[o.group]
      }
    }
    if (Object.keys(ov.propsDiff).length === 0 && ov.hidden === undefined) {
      delete v.overrides[o.nodeId]
    }
  },
})

export const createSetInstanceVariantCommand = (
  pageId: Id,
  instanceId: Id,
  variantId: Id | undefined,
): Command => ({
  name: 'set variant',
  apply: (d) => setInstanceVariant(d, pageId, instanceId, variantId),
})

// ---- スロット ----

const NO_SLOT_TYPES = new Set(['text', 'image', 'svg', 'instance'])

export const createAddSlotCommand = (o: {
  componentId: Id
  slotId: Id
  name: string
  nodeId: Id
}): Command => ({
  name: 'add slot',
  apply: (d) => {
    const def = defOf(d, o.componentId)
    const n = def.nodes[o.nodeId]
    if (!n) throw new Error(`component node not found: ${o.nodeId}`)
    if (NO_SLOT_TYPES.has(n.type)) throw new Error('この種類の要素はスロットにできません')
    if (def.slots.some((s) => s.nodeId === o.nodeId)) throw new Error('すでにスロットです')
    def.slots.push({ id: o.slotId, name: o.name.trim() || n.name, nodeId: o.nodeId })
  },
})

// 内容が入っているインスタンスがあるか
export function slotInUse(doc: UIDocument, componentId: Id, slotId: Id): boolean {
  return allPages(doc).some((p) =>
    Object.values(p.nodes).some(
      (n) =>
        n.componentRef?.componentId === componentId &&
        (n.componentRef.slotContent[slotId]?.length ?? 0) > 0,
    ),
  )
}

export const createRemoveSlotCommand = (componentId: Id, slotId: Id): Command => ({
  name: 'remove slot',
  apply: (d) => {
    const def = defOf(d, componentId)
    const i = def.slots.findIndex((s) => s.id === slotId)
    if (i < 0) throw new Error(`slot not found: ${slotId}`)
    if (slotInUse(d, componentId, slotId))
      throw new Error('内容が入っているスロットは解除できません')
    def.slots.splice(i, 1)
    for (const p of allPages(d)) {
      for (const n of Object.values(p.nodes)) {
        if (n.componentRef?.componentId === componentId) delete n.componentRef.slotContent[slotId]
      }
    }
  },
})

type SlotChild = { pageId: Id; instanceId: Id; slotId: Id }

// インスタンスの子としてノードを追加し、そのスロットの内容にする(1 履歴)
export const createAddSlotChildCommand = (o: SlotChild & { node: Node }): Command => ({
  name: 'add slot content',
  apply: (d) => {
    const page = pageOf(d, o.pageId)
    const inst = requireNode(page, o.instanceId)
    const ref = inst.componentRef
    if (!ref) throw new Error(`not an instance: ${o.instanceId}`)
    if (!defOf(d, ref.componentId).slots.some((s) => s.id === o.slotId)) {
      throw new Error(`slot not found: ${o.slotId}`)
    }
    addNode(page, structuredClone(o.node), o.instanceId)
    ref.slotContent[o.slotId] = [...(ref.slotContent[o.slotId] ?? []), o.node.id]
  },
})

// 空になったら記録を消す(定義側の既定の子が表示に戻る)
export const createRemoveSlotChildCommand = (o: SlotChild & { childId: Id }): Command => ({
  name: 'remove slot content',
  apply: (d) => {
    const page = pageOf(d, o.pageId)
    const inst = requireNode(page, o.instanceId)
    const ref = inst.componentRef
    if (!ref) throw new Error(`not an instance: ${o.instanceId}`)
    if (!inst.children.includes(o.childId)) throw new Error(`not a child: ${o.childId}`)
    removeNode(page, o.childId)
    const next = (ref.slotContent[o.slotId] ?? []).filter((x) => x !== o.childId)
    if (next.length > 0) ref.slotContent[o.slotId] = next
    else delete ref.slotContent[o.slotId]
  },
})
