import {
  allPages,
  copySubtrees,
  deleteNodes,
  duplicateNodes,
  getOverride,
  groupNodes,
  orderChildren,
  pasteClipboard,
  requireNode,
  setOverrideOrder,
  ungroupNode,
  zMove,
  type Command,
  type Id,
  type NodeClipboard,
  type Page,
  type ZDir,
} from '@/core'
import { findPage } from './commands'

// 生成した ID は execute 後に created に入る(選択の更新用)
export type WithCreated = { command: Command; created: Id[] }

export function createDuplicateCommand(pageId: Id, ids: Id[]): WithCreated {
  const created: Id[] = []
  return {
    created,
    command: {
      name: 'duplicate',
      apply: (d) => {
        created.length = 0
        created.push(...duplicateNodes(findPage(allPages(d), pageId), ids))
      },
    },
  }
}

export function createPasteCommand(
  pageId: Id,
  clip: NodeClipboard,
  parentId: Id,
  index?: number,
): WithCreated {
  const created: Id[] = []
  return {
    created,
    command: {
      name: 'paste',
      apply: (d) => {
        created.length = 0
        created.push(...pasteClipboard(findPage(allPages(d), pageId), clip, parentId, index))
      },
    },
  }
}

export const createDeleteCommand = (pageId: Id, ids: Id[]): Command => ({
  name: 'delete',
  apply: (d) => void deleteNodes(findPage(allPages(d), pageId), ids),
})

export function createGroupCommand(pageId: Id, ids: Id[]): WithCreated {
  const created: Id[] = []
  return {
    created,
    command: {
      name: 'group',
      apply: (d) => {
        created.length = 0
        created.push(groupNodes(findPage(allPages(d), pageId), ids))
      },
    },
  }
}

export const createUngroupCommand = (pageId: Id, id: Id): Command => ({
  name: 'ungroup',
  apply: (d) => void ungroupNode(findPage(allPages(d), pageId), id),
})

type ZOptions = {
  pageId: Id
  deviceId: Id
  base: boolean
  parentId: Id
  ids: Id[]
  dir: ZDir
}

// 並び替えと同じ書き込み先の流儀(基準デバイスは共有 children、それ以外は order override)
export function createZOrderCommand(o: ZOptions): Command {
  return {
    name: 'z-order',
    apply: (d) => {
      const page: Page = findPage(allPages(d), o.pageId)
      const parent = requireNode(page, o.parentId)
      const ov = getOverride(page, o.deviceId, o.parentId)
      const current = [...orderChildren(parent.children, ov?.order)]
      const next = zMove(current, o.ids, o.dir)
      if (next.every((id, i) => id === current[i])) return
      if (o.base && ov?.order === undefined) parent.children = next
      else setOverrideOrder(page, o.deviceId, o.parentId, next)
    },
  }
}

export { copySubtrees }
