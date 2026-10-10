import {
  newId,
  type ComponentDef,
  type ComponentRef,
  type ComponentVariant,
  type Id,
  type Node,
  type PropGroup,
  type Props,
  type UIDocument,
} from '../model'
import { createNode } from '../model'
import { requireNode } from '../store'

// ここの関数はすべて immer の recipe 内(Command の apply)で呼ぶ。不正操作は throw。

export function createComponentDef(name: string): ComponentDef {
  const root = createNode({ type: 'element', name })
  return {
    id: newId(),
    name,
    rootNodeId: root.id,
    nodes: { [root.id]: root },
    variants: [],
    slots: [],
  }
}

export function createInstanceNode(componentId: Id, variantId?: Id): Node {
  return createNode({
    type: 'instance',
    name: 'Instance',
    componentRef: { componentId, variantId, overrides: {}, slotContent: {} },
  })
}

function getDef(doc: UIDocument, componentId: Id): ComponentDef {
  const def = doc.components.find((c) => c.id === componentId)
  if (!def) throw new Error(`component not found: ${componentId}`)
  return def
}

function getInstance(doc: UIDocument, pageId: Id, instanceId: Id) {
  const page = doc.pages.find((p) => p.id === pageId)
  if (!page) throw new Error(`page not found: ${pageId}`)
  const node = requireNode(page, instanceId)
  const ref = node.componentRef
  if (!ref) throw new Error(`not an instance: ${instanceId}`)
  return { node, ref, def: getDef(doc, ref.componentId) }
}

function requireDefNode(def: ComponentDef, nodeId: Id): Node {
  const n = def.nodes[nodeId]
  if (!n) throw new Error(`component node not found: ${nodeId}`)
  return n
}

// ---- 定義側(親)の変更。インスタンスは自動で追従する ----

export function addComponent(doc: UIDocument, def: ComponentDef): void {
  if (doc.components.some((c) => c.id === def.id)) throw new Error(`component exists: ${def.id}`)
  doc.components.push(def)
}

export function setComponentProp(
  doc: UIDocument,
  componentId: Id,
  nodeId: Id,
  group: keyof Props,
  key: string,
  value: PropGroup[string],
): void {
  requireDefNode(getDef(doc, componentId), nodeId).props[group][key] = value
}

export function addVariant(doc: UIDocument, componentId: Id, variant: ComponentVariant): void {
  const def = getDef(doc, componentId)
  if (def.variants.some((v) => v.id === variant.id))
    throw new Error(`variant exists: ${variant.id}`)
  def.variants.push(variant)
}

export function setVariantProp(
  doc: UIDocument,
  componentId: Id,
  variantId: Id,
  nodeId: Id,
  group: keyof Props,
  key: string,
  value: PropGroup[string],
): void {
  const def = getDef(doc, componentId)
  requireDefNode(def, nodeId)
  const v = def.variants.find((x) => x.id === variantId)
  if (!v) throw new Error(`variant not found: ${variantId}`)
  const o = (v.overrides[nodeId] ??= { propsDiff: {} })
  ;(o.propsDiff[group] ??= {})[key] = value
}

// ---- インスタンス側 ----

function prune(ref: ComponentRef, targetId: Id): void {
  const o = ref.overrides[targetId]
  if (o && Object.keys(o.propsDiff).length === 0 && o.hidden === undefined) {
    delete ref.overrides[targetId]
  }
}

export function setInstanceOverride(
  doc: UIDocument,
  pageId: Id,
  instanceId: Id,
  targetId: Id,
  group: keyof Props,
  key: string,
  value: PropGroup[string],
): void {
  const { ref, def } = getInstance(doc, pageId, instanceId)
  requireDefNode(def, targetId)
  const o = (ref.overrides[targetId] ??= { propsDiff: {} })
  ;(o.propsDiff[group] ??= {})[key] = value
}

export function setInstanceHidden(
  doc: UIDocument,
  pageId: Id,
  instanceId: Id,
  targetId: Id,
  hidden: boolean | undefined,
): void {
  const { ref, def } = getInstance(doc, pageId, instanceId)
  requireDefNode(def, targetId)
  if (hidden === undefined) {
    if (ref.overrides[targetId]) delete ref.overrides[targetId].hidden
  } else {
    ;(ref.overrides[targetId] ??= { propsDiff: {} }).hidden = hidden
  }
  prune(ref, targetId)
}

// 引数を絞るほど範囲が狭い: 全部 / targetId のノード / +group / +key
export function resetInstanceOverride(
  doc: UIDocument,
  pageId: Id,
  instanceId: Id,
  targetId?: Id,
  group?: keyof Props,
  key?: string,
): void {
  const { ref } = getInstance(doc, pageId, instanceId)
  if (targetId === undefined) {
    ref.overrides = {}
    return
  }
  const o = ref.overrides[targetId]
  if (!o) return
  if (group === undefined) {
    delete ref.overrides[targetId]
    return
  }
  const g = o.propsDiff[group]
  if (g) {
    if (key === undefined) delete o.propsDiff[group]
    else {
      delete g[key]
      if (Object.keys(g).length === 0) delete o.propsDiff[group]
    }
  }
  prune(ref, targetId)
}

export function setInstanceVariant(
  doc: UIDocument,
  pageId: Id,
  instanceId: Id,
  variantId: Id | undefined,
): void {
  const { ref, def } = getInstance(doc, pageId, instanceId)
  if (variantId !== undefined && !def.variants.some((v) => v.id === variantId)) {
    throw new Error(`variant not found: ${variantId}`)
  }
  ref.variantId = variantId
}

// childIds はインスタンスノードの children であること(追加は addNode で行う)
export function setInstanceSlot(
  doc: UIDocument,
  pageId: Id,
  instanceId: Id,
  slotId: Id,
  childIds: Id[],
): void {
  const { node, ref, def } = getInstance(doc, pageId, instanceId)
  if (!def.slots.some((s) => s.id === slotId)) throw new Error(`slot not found: ${slotId}`)
  for (const c of childIds) {
    if (!node.children.includes(c)) throw new Error(`not a child of the instance: ${c}`)
  }
  ref.slotContent[slotId] = [...childIds]
}
