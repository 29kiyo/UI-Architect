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

// content-box の要素は width/height に padding と border が加わる。その合計(border-box なら 0)
export function measureBoxExtra(
  container: HTMLElement,
  deviceId: Id,
  nodeId: Id,
): { w: number; h: number } {
  const el = container.querySelector<HTMLElement>(
    `[data-device-id="${cssStr(deviceId)}"] [data-node-id="${cssStr(nodeId)}"]`,
  )
  if (!el) return { w: 0, h: 0 }
  const cs = getComputedStyle(el)
  if (cs.boxSizing === 'border-box') return { w: 0, h: 0 }
  const f = (k: string) => parseFloat(cs.getPropertyValue(k)) || 0
  return {
    w: f('padding-left') + f('padding-right') + f('border-left-width') + f('border-right-width'),
    h: f('padding-top') + f('padding-bottom') + f('border-top-width') + f('border-bottom-width'),
  }
}

// デバイス内の全ノード(exclude を除く、表示中のもの)の矩形をワールド座標で返す(スナップ対象の収集用)
export function measureAllRects(
  container: HTMLElement,
  vp: Viewport,
  deviceId: Id,
  exclude: ReadonlySet<Id>,
): WorldRect[] {
  const c = container.getBoundingClientRect()
  const out: WorldRect[] = []
  container
    .querySelectorAll<HTMLElement>(`[data-device-id="${cssStr(deviceId)}"] [data-node-id]`)
    .forEach((el) => {
      const id = el.dataset.nodeId
      if (!id || exclude.has(id) || el.getClientRects().length === 0) return
      const r = el.getBoundingClientRect()
      const p = screenToWorld(vp, {
        x: r.left - c.left - container.clientLeft,
        y: r.top - c.top - container.clientTop,
      })
      out.push({ x: p.x, y: p.y, width: r.width / vp.zoom, height: r.height / vp.zoom })
    })
  return out
}
