import {
  editablePages,
  requireNode,
  setOverrideHidden,
  getOverride,
  type Command,
  type Id,
} from '@/core'
import { findPage } from './commands'

// 基準デバイスは共有の hidden、それ以外は overrides に書く(createPropsCommand と同じ流儀)。
// 基準でも既にそのデバイスで hidden を上書き済みなら、上書きの方を更新する
export const createSetHiddenAtDeviceCommand = (o: {
  pageId: Id
  deviceId: Id
  base: boolean
  nodeIds: Id[]
  hidden: boolean
}): Command => ({
  name: o.hidden ? 'hide at device' : 'show at device',
  apply: (d) => {
    const page = findPage(editablePages(d), o.pageId)
    for (const id of o.nodeIds) {
      const hasOv = getOverride(page, o.deviceId, id)?.hidden !== undefined
      if (o.base && !hasOv) requireNode(page, id).hidden = o.hidden
      else setOverrideHidden(page, o.deviceId, id, o.hidden)
    }
  },
})

// そのデバイスの上書きを消して共有値に戻す
export const createResetHiddenAtDeviceCommand = (o: {
  pageId: Id
  deviceId: Id
  nodeIds: Id[]
}): Command => ({
  name: 'reset hidden at device',
  apply: (d) => {
    const page = findPage(editablePages(d), o.pageId)
    for (const id of o.nodeIds) setOverrideHidden(page, o.deviceId, id, undefined)
  },
})

// 実効の hidden と、上書き中かどうか
export function hiddenState(
  page: Parameters<typeof getOverride>[0],
  deviceId: Id,
  nodeId: Id,
): { hidden: boolean; overridden: boolean } {
  const o = getOverride(page, deviceId, nodeId)
  const shared = page.nodes[nodeId]?.hidden === true
  return { hidden: o?.hidden ?? shared, overridden: o?.hidden !== undefined }
}
