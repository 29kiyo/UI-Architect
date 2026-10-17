import {
  allPages,
  attachNode,
  detachNode,
  getOverride,
  resetOverrideProp,
  type Command,
  type Id,
  type Page,
  type Props,
} from '@/core'
import { findPage } from '../canvas/commands'

export type OverrideState = 'shared' | 'overridden'

// そのキーがこのデバイスで上書きされているか。detached は全キーが上書き扱い
export function overrideState(
  page: Page,
  deviceId: Id,
  nodeId: Id,
  group: keyof Props,
  key: string,
): OverrideState {
  const o = getOverride(page, deviceId, nodeId)
  if (!o) return 'shared'
  if (o.detached) return 'overridden'
  return o.propsDiff[group]?.[key] !== undefined ? 'overridden' : 'shared'
}

export const isDetachedAt = (page: Page, deviceId: Id, nodeId: Id): boolean =>
  getOverride(page, deviceId, nodeId)?.detached === true

// 共通値に戻す(そのデバイスの上書きを消す)。detached では不可
export function canResetProp(page: Page, deviceId: Id, nodeId: Id): boolean {
  return !isDetachedAt(page, deviceId, nodeId)
}

type Target = { pageId: Id; deviceId: Id; nodeId: Id }

export function createResetPropCommand(t: Target, group: keyof Props, key: string): Command {
  return {
    name: 'reset override',
    apply: (draft) => {
      resetOverrideProp(findPage(allPages(draft), t.pageId), t.deviceId, t.nodeId, group, key)
    },
  }
}

export function createDetachCommand(t: Target): Command {
  return {
    name: 'detach',
    apply: (draft) => {
      detachNode(findPage(allPages(draft), t.pageId), t.deviceId, t.nodeId)
    },
  }
}

export function createAttachCommand(t: Target): Command {
  return {
    name: 'attach',
    apply: (draft) => {
      attachNode(findPage(allPages(draft), t.pageId), t.deviceId, t.nodeId)
    },
  }
}
