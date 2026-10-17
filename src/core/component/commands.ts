import { current, isDraft } from 'immer'
import type { Command } from '../history'
import { allPages } from '../master'
import { newId, type ComponentDef, type Id, type Node, type Page, type UIDocument } from '../model'
import { addNode, getParentId, removeNode, requireNode } from '../store'
import { createInstanceNode } from './ops'
import { mergeInstanceProps, resolveInstance } from './resolve'

// draft でも通常オブジェクトでも、structuredClone できる素の値にする
const plain = <T>(v: T): T => (isDraft(v) ? (current(v as never) as T) : v)

function pageOf(d: UIDocument, pageId: Id): Page {
  const p = allPages(d).find((x) => x.id === pageId)
  if (!p) throw new Error(`page not found: ${pageId}`)
  return p
}

function subtreeIds(page: Page, id: Id): Id[] {
  const out: Id[] = []
  const visit = (cur: Id) => {
    out.push(cur)
    for (const c of requireNode(page, cur).children) visit(c)
  }
  visit(id)
  return out
}

export type ComponentUsage = { pageId: Id; nodeId: Id }

export function findComponentUsages(doc: UIDocument, componentId: Id): ComponentUsage[] {
  const out: ComponentUsage[] = []
  for (const p of allPages(doc)) {
    for (const n of Object.values(p.nodes)) {
      if (n.componentRef?.componentId === componentId) out.push({ pageId: p.id, nodeId: n.id })
    }
  }
  return out
}

type FromNodeOptions = {
  pageId: Id
  nodeId: Id
  componentId: Id // 呼び出し側で newId() を渡す(Redo で同じ ID になる)
  name: string
  scope: 'project' | 'page'
}

// 選択ノードのサブツリーを定義に移し、同じ ID のインスタンスに置き換える(1 履歴)
export function createComponentFromNodeCommand(o: FromNodeOptions): Command {
  return {
    name: 'make component',
    apply: (d) => {
      const page = pageOf(d, o.pageId)
      if (o.nodeId === page.rootNodeId) throw new Error('ルートはコンポーネント化できません')
      requireNode(page, o.nodeId)
      if (!getParentId(page, o.nodeId)) throw new Error('親が見つかりません')
      const ids = subtreeIds(page, o.nodeId) // ids[0] がルート
      if (ids.some((id) => page.nodes[id]?.componentRef)) {
        throw new Error('インスタンスを含むノードはコンポーネント化できません')
      }
      const nodes: Record<Id, Node> = {}
      for (const id of ids) nodes[id] = structuredClone(plain(page.nodes[id]!))

      const defRoot = nodes[o.nodeId]!
      const position = defRoot.props.position
      const events = defRoot.events
      const { hidden, locked, name, category } = defRoot
      defRoot.props.position = {}
      defRoot.events = []
      defRoot.hidden = false
      defRoot.locked = false

      const def: ComponentDef = {
        id: o.componentId,
        name: o.name.trim() || name,
        rootNodeId: o.nodeId,
        nodes,
        variants: [],
        slots: [],
        scope: o.scope,
        ...(o.scope === 'page' ? { ownerId: o.pageId } : {}),
      }
      const inst: Node = {
        ...createInstanceNode(o.componentId),
        id: o.nodeId,
        name,
        category,
        hidden,
        locked,
        events,
      }
      inst.props.position = position

      // 内側ノードはページから外す(それらへのデバイス別上書きは破棄される)
      for (const id of ids.slice(1)) {
        delete page.nodes[id]
        for (const byNode of Object.values(page.overrides)) delete byNode[id]
      }
      page.nodes[o.nodeId] = inst
      d.components.push(def)
    },
  }
}

// 配置用のインスタンスノード(まだ追加しない)
export function createInstanceFor(doc: UIDocument, componentId: Id): Node {
  const def = doc.components.find((c) => c.id === componentId)
  if (!def) throw new Error(`component not found: ${componentId}`)
  return {
    ...createInstanceNode(componentId),
    name: def.name,
    category: def.nodes[def.rootNodeId]?.category ?? 'container',
  }
}

export const createAddInstanceCommand = (
  pageId: Id,
  node: Node,
  parentId: Id,
  index?: number,
): Command => ({
  name: 'add instance',
  apply: (d) => {
    const page = pageOf(d, pageId)
    const def = d.components.find((c) => c.id === node.componentRef?.componentId)
    if (!def) throw new Error('コンポーネントが見つかりません')
    if (def.scope === 'page' && def.ownerId !== pageId) {
      throw new Error('このコンポーネントは他のページ専用です')
    }
    if (requireNode(page, parentId).componentRef) {
      throw new Error('インスタンスの中には直接追加できません')
    }
    addNode(page, structuredClone(node), parentId, index)
  },
})

// インスタンスを展開結果のノード群に置き換える(上書き・バリアントを反映して固定)
export const createDetachInstanceCommand = (pageId: Id, instanceId: Id): Command => ({
  name: 'detach instance',
  apply: (d) => {
    const page = pageOf(d, pageId)
    const inst = plain(requireNode(page, instanceId))
    const res = resolveInstance(plain(d), inst)
    if (!res) throw new Error('コンポーネントの定義が見つかりません')

    const idMap = new Map<Id, Id>()
    for (const id of Object.keys(res.nodes)) {
      idMap.set(id, id === res.rootNodeId ? instanceId : newId())
    }
    const keep = new Set<Id>()
    const created: Node[] = []
    for (const [id, n] of Object.entries(res.nodes)) {
      const c = structuredClone(n)
      c.id = idMap.get(id)!
      // スロット内容はページ側の ID(そのまま)、定義内の子は新 ID に写す
      c.children = c.children.map((x) => {
        if (inst.children.includes(x)) {
          keep.add(x)
          return x
        }
        return idMap.get(x) ?? x
      })
      c.events = c.events.map((e) => ({
        ...e,
        id: newId(),
        actions: e.actions.map((a) =>
          a.type === 'showHide' ? { ...a, nodeId: idMap.get(a.nodeId) ?? a.nodeId } : a,
        ),
      }))
      delete c.componentRef
      if (id === res.rootNodeId) {
        c.props = mergeInstanceProps(c.props, structuredClone(inst.props))
        c.events = structuredClone(inst.events)
        c.hidden = inst.hidden || c.hidden
        c.locked = inst.locked
        c.name = inst.name
      }
      created.push(c)
    }
    // どのスロットにも入っていないインスタンスの子は残せないので削除
    for (const cid of inst.children) {
      if (!keep.has(cid) && page.nodes[cid]) removeNode(page, cid)
    }
    for (const c of created) page.nodes[c.id] = c
  },
})

export const createRenameComponentCommand = (componentId: Id, name: string): Command => ({
  name: 'rename component',
  apply: (d) => {
    const n = name.trim()
    if (!n) throw new Error('コンポーネント名が空です')
    const def = d.components.find((c) => c.id === componentId)
    if (!def) throw new Error(`component not found: ${componentId}`)
    def.name = n
  },
})

// 使用中の定義は削除できない(参照切れを作らない)
export const createRemoveComponentCommand = (componentId: Id): Command => ({
  name: 'remove component',
  apply: (d) => {
    const i = d.components.findIndex((c) => c.id === componentId)
    if (i < 0) throw new Error(`component not found: ${componentId}`)
    const used = findComponentUsages(plain(d), componentId).length
    if (used > 0) throw new Error(`${used} 箇所で使用中のため削除できません`)
    d.components.splice(i, 1)
    d.variables = d.variables.filter((v) => !(v.scope === 'component' && v.ownerId === componentId))
  },
})
