import {
  getOverride,
  orderChildren,
  requireNode,
  setOverrideOrder,
  setOverrideProp,
  type Command,
  type Id,
  type Page,
  type Props,
} from '@/core'
import { applyReorder } from './transform'

export type PropWrite = { nodeId: Id; group: keyof Props; key: string; value: string | number }

// 基準デバイス(devices[0])は共有ノード木、それ以外は overrides に書く
export const isBaseDevice = (devices: { id: Id }[], deviceId: Id): boolean =>
  devices[0]?.id === deviceId

function findPage(pages: Page[], pageId: Id): Page {
  const page = pages.find((p) => p.id === pageId)
  if (!page) throw new Error(`page not found: ${pageId}`)
  return page
}

// 基準デバイスでも、そのキーを既に override していれば override に書く(見た目が変わらなくなるのを防ぐ)
function writeProp(page: Page, deviceId: Id, base: boolean, w: PropWrite): void {
  const o = getOverride(page, deviceId, w.nodeId)
  if (!base || o?.detached || o?.propsDiff[w.group]?.[w.key] !== undefined) {
    setOverrideProp(page, deviceId, w.nodeId, w.group, w.key, w.value)
  } else {
    requireNode(page, w.nodeId).props[w.group][w.key] = w.value
  }
}

type PropsCommandOptions = {
  name: string
  pageId: Id
  deviceId: Id
  base: boolean
  writes: PropWrite[]
  coalesceKey?: string | undefined
}

// 値は「開始値+移動量」の絶対値で渡すこと(coalesce しても結果が変わらない)
export function createPropsCommand(o: PropsCommandOptions): Command {
  return {
    name: o.name,
    ...(o.coalesceKey ? { coalesceKey: o.coalesceKey } : {}),
    apply: (draft) => {
      const page = findPage(draft.pages, o.pageId)
      for (const w of o.writes) writeProp(page, o.deviceId, o.base, w)
    },
  }
}

type ReorderOptions = {
  pageId: Id
  deviceId: Id
  base: boolean
  parentId: Id
  nodeId: Id
  beforeId: Id | undefined // この兄弟の前へ。undefined は末尾
}

export function createReorderCommand(o: ReorderOptions): Command {
  return {
    name: 'reorder',
    apply: (draft) => {
      const page = findPage(draft.pages, o.pageId)
      const parent = requireNode(page, o.parentId)
      const ov = getOverride(page, o.deviceId, o.parentId)
      const current = [...orderChildren(parent.children, ov?.order)]
      const next = applyReorder(current, o.nodeId, o.beforeId)
      if (next.every((id, i) => id === current[i])) return
      if (o.base && ov?.order === undefined) parent.children = next
      else setOverrideOrder(page, o.deviceId, o.parentId, next)
    },
  }
}
