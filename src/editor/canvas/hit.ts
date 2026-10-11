import type { Id } from '@/core'
import { screenToWorld, type Viewport, type WorldRect } from './viewport'

const cssStr = (s: string) => s.replace(/["\\]/g, '\\$&')

// イベント対象の DOM から (デバイス, ノード) を特定する(NodeView の data-node-id と、アートボードの data-device-id)
export function hitFromElement(
  target: EventTarget | null,
): { deviceId: Id; nodeId: Id } | undefined {
  if (!(target instanceof Element)) return undefined
  const dev = target.closest<HTMLElement>('[data-device-id]')
  const node = target.closest<HTMLElement>('[data-node-id]')
  const deviceId = dev?.dataset.deviceId
  const nodeId = node?.dataset.nodeId
  if (!dev || !node || !deviceId || !nodeId || !dev.contains(node)) return undefined
  return { deviceId, nodeId }
}

// DOM の実測矩形をワールド座標にする(container = キャンバスのビューポート要素)
export function measureWorldRect(
  container: HTMLElement,
  vp: Viewport,
  deviceId: Id,
  nodeId: Id,
): WorldRect | undefined {
  const el = container.querySelector(
    `[data-device-id="${cssStr(deviceId)}"] [data-node-id="${cssStr(nodeId)}"]`,
  )
  if (!el || el.getClientRects().length === 0) return undefined // 非表示(display:none)等
  const r = el.getBoundingClientRect()
  const c = container.getBoundingClientRect()
  const p = screenToWorld(vp, {
    x: r.left - c.left - container.clientLeft,
    y: r.top - c.top - container.clientTop,
  })
  return { x: p.x, y: p.y, width: r.width / vp.zoom, height: r.height / vp.zoom }
}
