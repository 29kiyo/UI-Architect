import {
  copySubtrees,
  getParentId,
  topLevelIds,
  type History,
  type Id,
  type NodeClipboard,
  type Page,
  type UIDocument,
} from '@/core'
import { isBaseDevice } from './commands'
import { createAddNodeCommand } from './nodeCommands'
import { planPaletteDrop } from './palette'
import { selectionStore } from './selection'
import type { EditAction } from './shortcuts'
import {
  createDeleteCommand,
  createDuplicateCommand,
  createGroupCommand,
  createPasteCommand,
  createUngroupCommand,
  createZOrderCommand,
} from './structure'
import type { Point, WorldRect } from './viewport'

export type EditEnv = { doc: UIDocument; page: Page; history: History }

// アプリ内クリップボード(複数コピーに対応するためサブツリーごと保持)
let clipboard: NodeClipboard | undefined
export const getClipboard = () => clipboard
export const clearClipboard = () => {
  clipboard = undefined
}

export function runEditAction(action: EditAction, env: EditEnv): void {
  const { doc, page, history } = env
  if (action === 'undo') {
    history.undo()
    return
  }
  if (action === 'redo') {
    history.redo()
    return
  }
  const sel = selectionStore.getState()
  const deviceId = sel.activeDeviceId ?? doc.devices[0]?.id
  const ids = sel.selectedIds.filter((id) => id in page.nodes && id !== page.rootNodeId)
  const editable = ids.filter((id) => !page.nodes[id]?.locked) // ロック中は削除/構造変更しない
  const select = (created: Id[]) => {
    if (created.length > 0 && deviceId) selectionStore.getState().pickMany(created, deviceId, false)
  }

  switch (action) {
    case 'copy': {
      if (ids.length > 0) clipboard = copySubtrees(page, ids)
      return
    }
    case 'paste': {
      if (!clipboard) return
      const first = ids[0]
      const pid = first ? getParentId(page, first) : undefined
      const index = first && pid ? (page.nodes[pid]?.children.indexOf(first) ?? -1) + 1 : undefined
      const cmd = createPasteCommand(page.id, clipboard, pid ?? page.rootNodeId, index)
      history.execute(cmd.command)
      select(cmd.created)
      return
    }
    case 'duplicate': {
      if (ids.length === 0) return
      const cmd = createDuplicateCommand(page.id, ids)
      history.execute(cmd.command)
      select(cmd.created)
      return
    }
    case 'delete': {
      if (editable.length > 0) history.execute(createDeleteCommand(page.id, editable))
      return
    }
    case 'group': {
      const top = topLevelIds(page, editable)
      if (top.length === 0 || new Set(top.map((id) => getParentId(page, id))).size !== 1) return
      const cmd = createGroupCommand(page.id, top)
      history.execute(cmd.command)
      select(cmd.created)
      return
    }
    case 'ungroup': {
      const id = editable[0]
      const n = id ? page.nodes[id] : undefined
      if (editable.length !== 1 || !id || !n || n.children.length === 0 || n.componentRef) return
      const kids = [...n.children]
      history.execute(createUngroupCommand(page.id, id))
      select(kids)
      return
    }
    case 'front':
    case 'back':
    case 'forward':
    case 'backward': {
      if (!deviceId || editable.length === 0) return
      const parents = new Set(editable.map((id) => getParentId(page, id)))
      const parentId = [...parents][0]
      if (parents.size !== 1 || !parentId) return
      history.execute(
        createZOrderCommand({
          pageId: page.id,
          deviceId,
          base: isBaseDevice(doc.devices, deviceId),
          parentId,
          ids: editable,
          dir: action,
        }),
      )
      return
    }
  }
}

export type PaletteDrop = {
  deviceId: Id
  hitId: Id | undefined
  category: string
  world: Point
  rectOf: (id: Id) => WorldRect | undefined
}

// パレットからのドロップ: ノードを作って追加(共有ノード木。全デバイスに現れる)し、選択する
export function dropCategory(env: EditEnv, d: PaletteDrop): Id | undefined {
  const plan = planPaletteDrop(env.page, d.hitId, d.category, d.world, d.rectOf)
  if (!plan) return undefined
  env.history.execute(createAddNodeCommand(env.page.id, plan.node, plan.parentId))
  selectionStore.getState().pick(plan.node.id, d.deviceId, false)
  return plan.node.id
}
