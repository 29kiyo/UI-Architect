import { deviceSize, type Device } from '@/core'
import type { WorldRect } from './viewport'

export type Artboard = { deviceId: string; name: string; rect: WorldRect }

export const ARTBOARD_GAP = 120

// デバイスを横一列に配置(並列表示)。回転による幅高さ入替えは 5-G
export function layoutArtboards(devices: Device[], gap = ARTBOARD_GAP): Artboard[] {
  let x = 0
  return devices.map((d) => {
    const { width, height } = deviceSize(d) // 回転を反映
    const rect = { x, y: 0, width, height }
    x += width + gap
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

// 端末フレーム(表示専用): アートボードの外側に pad だけ張り出す。radius は画面側の角丸
export function frameFor(kind: Device['kind']): { pad: number; radius: number } {
  switch (kind) {
    case 'mobile':
      return { pad: 12, radius: 36 }
    case 'tablet':
      return { pad: 14, radius: 20 }
    default:
      return { pad: 6, radius: 6 }
  }
}

// セーフエリアの帯(上下は全幅、左右は上下の帯の間)
export function safeBands(
  r: WorldRect,
  s: { top: number; right: number; bottom: number; left: number },
): WorldRect[] {
  const out: WorldRect[] = []
  if (s.top > 0) out.push({ x: r.x, y: r.y, width: r.width, height: s.top })
  if (s.bottom > 0) {
    out.push({ x: r.x, y: r.y + r.height - s.bottom, width: r.width, height: s.bottom })
  }
  const y = r.y + Math.max(0, s.top)
  const h = Math.max(0, r.height - Math.max(0, s.top) - Math.max(0, s.bottom))
  if (h > 0 && s.left > 0) out.push({ x: r.x, y, width: s.left, height: h })
  if (h > 0 && s.right > 0) out.push({ x: r.x + r.width - s.right, y, width: s.right, height: h })
  return out
}
