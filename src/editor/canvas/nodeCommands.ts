import {
  addNode,
  editablePages,
  getParentId,
  moveNode,
  requireNode,
  type Command,
  type Id,
  type Node,
} from '@/core'
import { createReorderCommand, findPage } from './commands'

export const createAddNodeCommand = (
  pageId: Id,
  node: Node,
  parentId: Id,
  index?: number,
): Command => ({
  name: 'add-node',
  apply: (d) => addNode(findPage(editablePages(d), pageId), node, parentId, index),
})

export type MoveToOptions = {
  pageId: Id
  deviceId: Id
  base: boolean
  nodeId: Id
  parentId: Id
  beforeId: Id | undefined // この兄弟の前へ。undefined は末尾
}

// 同じ親なら並び替え(デバイス別 order に対応)、別の親なら共有ノード木で付け替える
export function createMoveToCommand(o: MoveToOptions): Command {
  return {
    name: 'move-node',
    apply: (d) => {
      const page = findPage(editablePages(d), o.pageId)
      if (getParentId(page, o.nodeId) === o.parentId) {
        createReorderCommand(o).apply(d)
        return
      }
      const kids = requireNode(page, o.parentId).children
      const i = o.beforeId === undefined ? -1 : kids.indexOf(o.beforeId)
      moveNode(page, o.nodeId, o.parentId, i >= 0 ? i : undefined)
    },
  }
}

export type NodeMeta = { name?: string; hidden?: boolean; locked?: boolean }

export const createNodeMetaCommand = (
  pageId: Id,
  id: Id,
  patch: NodeMeta,
  label = 'edit-node',
): Command => ({
  name: label,
  apply: (d) => {
    const n = requireNode(findPage(editablePages(d), pageId), id)
    if (patch.name !== undefined) n.name = patch.name
    if (patch.hidden !== undefined) n.hidden = patch.hidden
    if (patch.locked !== undefined) n.locked = patch.locked
  },
})
