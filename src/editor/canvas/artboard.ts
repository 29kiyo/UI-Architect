import type { Device } from '@/core'
import type { WorldRect } from './viewport'

export type Artboard = { deviceId: string; name: string; rect: WorldRect }

export const ARTBOARD_GAP = 120

// デバイスを横一列に配置(並列表示)。回転による幅高さ入替えは 5-G
export function layoutArtboards(devices: Device[], gap = ARTBOARD_GAP): Artboard[] {
  let x = 0
  return devices.map((d) => {
    const rect = { x, y: 0, width: d.width, height: d.height }
    x += d.width + gap
    return { deviceId: d.id, name: d.name, rect }
  })
}

export function unionRect(rects: WorldRect[]): WorldRect | undefined {
  if (rects.length === 0) return undefined
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const r of rects) {
    x1 = Math.min(x1, r.x)
    y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, r.x + r.width)
    y2 = Math.max(y2, r.y + r.height)
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}
