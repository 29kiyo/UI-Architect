import {
  PROP_GROUP_KEYS,
  type Id,
  type NodeOverride,
  type Page,
  type PropGroup,
  type PropsDiff,
  type Props,
} from '../model'
import { requireNode } from '../store'
import { resolveProps } from './resolve'

// ここの関数はすべて immer の recipe 内(Command の apply)で呼ぶ。不正操作は throw。

function ensure(page: Page, deviceId: Id, nodeId: Id): NodeOverride {
  requireNode(page, nodeId)
  const byNode = (page.overrides[deviceId] ??= {})
  return (byNode[nodeId] ??= { propsDiff: {}, detached: false })
}

// 何も上書きしていない override / 空のデバイス枠は消す
function prune(page: Page, deviceId: Id, nodeId: Id): void {
  const byNode = page.overrides[deviceId]
  const o = byNode?.[nodeId]
  if (!byNode || !o) return
  const empty =
    Object.keys(o.propsDiff).length === 0 &&
    o.hidden === undefined &&
    o.order === undefined &&
    !o.detached
  if (empty) delete byNode[nodeId]
  if (Object.keys(byNode).length === 0) delete page.overrides[deviceId]
}

export function setOverrideProp(
  page: Page,
  deviceId: Id,
  nodeId: Id,
  group: keyof Props,
  key: string,
  value: PropGroup[string],
): void {
  const o = ensure(page, deviceId, nodeId)
  const g = (o.propsDiff[group] ??= {})
  g[key] = value
}

// key 省略でグループごと戻す。detached なノードでは意味が無いので拒否(attachNode を使う)。
export function resetOverrideProp(
  page: Page,
  deviceId: Id,
  nodeId: Id,
  group: keyof Props,
  key?: string,
): void {
  const o = page.overrides[deviceId]?.[nodeId]
  if (!o) return
  if (o.detached) throw new Error('node is detached; use attachNode')
  const g = o.propsDiff[group]
  if (g) {
    if (key === undefined) delete o.propsDiff[group]
    else {
      delete g[key]
      if (Object.keys(g).length === 0) delete o.propsDiff[group]
    }
  }
  prune(page, deviceId, nodeId)
}

// undefined で共有値に戻す
export function setOverrideHidden(
  page: Page,
  deviceId: Id,
  nodeId: Id,
  hidden: boolean | undefined,
): void {
  if (hidden === undefined) {
    const o = page.overrides[deviceId]?.[nodeId]
    if (o) delete o.hidden
  } else {
    ensure(page, deviceId, nodeId).hidden = hidden
  }
  prune(page, deviceId, nodeId)
}

// undefined で共有順に戻す
export function setOverrideOrder(
  page: Page,
  deviceId: Id,
  nodeId: Id,
  order: Id[] | undefined,
): void {
  if (order === undefined) {
    const o = page.overrides[deviceId]?.[nodeId]
    if (o) delete o.order
  } else {
    ensure(page, deviceId, nodeId).order = [...order]
  }
  prune(page, deviceId, nodeId)
}

// 現在の実効 props をスナップショットとして保持し、以後は共有 props に追従しない
export function detachNode(page: Page, deviceId: Id, nodeId: Id): void {
  const node = requireNode(page, nodeId)
  const o = ensure(page, deviceId, nodeId)
  if (o.detached) return
  const resolved = resolveProps(node.props, o)
  const snapshot: PropsDiff = {}
  for (const g of PROP_GROUP_KEYS) {
    // draft 参照を持ち込まないよう JSON で複製する
    if (Object.keys(resolved[g]).length > 0) snapshot[g] = JSON.parse(JSON.stringify(resolved[g]))
  }
  o.propsDiff = snapshot
  o.detached = true
}

// 共有に戻す(スナップショットは破棄。hidden / order は残す)
export function attachNode(page: Page, deviceId: Id, nodeId: Id): void {
  const o = page.overrides[deviceId]?.[nodeId]
  if (!o?.detached) return
  o.propsDiff = {}
  o.detached = false
  prune(page, deviceId, nodeId)
}

// そのデバイスの override を全部消す
export function clearNodeOverride(page: Page, deviceId: Id, nodeId: Id): void {
  const byNode = page.overrides[deviceId]
  if (!byNode?.[nodeId]) return
  delete byNode[nodeId]
  prune(page, deviceId, nodeId)
}
