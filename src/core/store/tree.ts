import type { Id, Node, Page } from '../model'

// ---- 参照系(読み取り専用) ----

export function getNode(page: Page, id: Id): Node | undefined {
  return page.nodes[id]
}

export function requireNode(page: Page, id: Id): Node {
  const node = page.nodes[id]
  if (!node) throw new Error(`node not found: ${id}`)
  return node
}

export function buildParentMap(page: Page): Map<Id, Id> {
  const map = new Map<Id, Id>()
  for (const node of Object.values(page.nodes)) {
    for (const childId of node.children) map.set(childId, node.id)
  }
  return map
}

export function getParentId(page: Page, id: Id): Id | undefined {
  for (const node of Object.values(page.nodes)) {
    if (node.children.includes(id)) return node.id
  }
  return undefined
}

// 深さ優先(前順)。visit が false を返すとその子孫はスキップ。循環があっても無限ループしない。
export function walk(
  page: Page,
  visit: (node: Node, depth: number, parentId: Id | undefined) => void | false,
  fromId: Id = page.rootNodeId,
): void {
  const seen = new Set<Id>()
  const rec = (id: Id, depth: number, parentId: Id | undefined) => {
    const node = page.nodes[id]
    if (!node || seen.has(id)) return
    seen.add(id)
    if (visit(node, depth, parentId) === false) return
    for (const childId of node.children) rec(childId, depth + 1, id)
  }
  rec(fromId, 0, undefined)
}

export function getDescendantIds(page: Page, id: Id): Id[] {
  const out: Id[] = []
  walk(
    page,
    (n) => {
      if (n.id !== id) out.push(n.id)
    },
    id,
  )
  return out
}

// 近い親から順に root まで
export function getAncestorIds(page: Page, id: Id): Id[] {
  const parents = buildParentMap(page)
  const out: Id[] = []
  for (let cur = parents.get(id); cur !== undefined; cur = parents.get(cur)) {
    if (out.includes(cur)) break
    out.push(cur)
  }
  return out
}

// ---- 更新系(immer の recipe 内で呼ぶ。不正操作は throw) ----

function insertAt(arr: Id[], id: Id, index?: number): void {
  const i = index === undefined ? arr.length : Math.max(0, Math.min(index, arr.length))
  arr.splice(i, 0, id)
}

// 子を持たない単一ノードを追加する(サブツリーの貼り付けは Phase 5 で別途)
export function addNode(page: Page, node: Node, parentId: Id, index?: number): void {
  const parent = requireNode(page, parentId)
  if (page.nodes[node.id]) throw new Error(`node already exists: ${node.id}`)
  if (node.children.length > 0) throw new Error('addNode: node must have no children')
  page.nodes[node.id] = node
  insertAt(parent.children, node.id, index)
}

// 子孫ごと削除し、削除した ID 一覧を返す。root は削除不可。
export function removeNode(page: Page, id: Id): Id[] {
  if (id === page.rootNodeId) throw new Error('cannot remove root node')
  requireNode(page, id)
  const removed = [id, ...getDescendantIds(page, id)]
  const parentId = getParentId(page, id)
  if (parentId !== undefined) {
    const parent = requireNode(page, parentId)
    parent.children = parent.children.filter((c) => c !== id)
  }
  for (const rid of removed) delete page.nodes[rid]
  return removed
}

// 親の変更と並べ替えを兼ねる。index は「自分を取り除いた後の配列」での挿入位置。
export function moveNode(page: Page, id: Id, newParentId: Id, index?: number): void {
  if (id === page.rootNodeId) throw new Error('cannot move root node')
  requireNode(page, id)
  const newParent = requireNode(page, newParentId)
  if (newParentId === id || getDescendantIds(page, id).includes(newParentId)) {
    throw new Error('cannot move node into itself or its descendant')
  }
  const oldParentId = getParentId(page, id)
  if (oldParentId === undefined) throw new Error(`node has no parent: ${id}`)
  const oldParent = requireNode(page, oldParentId)
  oldParent.children = oldParent.children.filter((c) => c !== id)
  insertAt(newParent.children, id, index)
}
