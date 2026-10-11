export type Point = { x: number; y: number }
export type WorldRect = { x: number; y: number; width: number; height: number }
export type Viewport = { zoom: number; panX: number; panY: number }

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8
export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 40, panY: 40 }

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export const worldToScreen = (vp: Viewport, p: Point): Point => ({
  x: p.x * vp.zoom + vp.panX,
  y: p.y * vp.zoom + vp.panY,
})

export const screenToWorld = (vp: Viewport, p: Point): Point => ({
  x: (p.x - vp.panX) / vp.zoom,
  y: (p.y - vp.panY) / vp.zoom,
})

// screen の点がワールド上で動かないようにズームする
export function zoomAt(vp: Viewport, screen: Point, nextZoom: number): Viewport {
  const zoom = clampZoom(nextZoom)
  const w = screenToWorld(vp, screen)
  return { zoom, panX: screen.x - w.x * zoom, panY: screen.y - w.y * zoom }
}

export const panBy = (vp: Viewport, dx: number, dy: number): Viewport => ({
  ...vp,
  panX: vp.panX + dx,
  panY: vp.panY + dy,
})

// rect を画面(view)の中央に収める(拡大は等倍まで)
export function fitRect(
  rect: WorldRect,
  view: { width: number; height: number },
  padding = 40,
): Viewport {
  const zx = (view.width - padding * 2) / Math.max(1, rect.width)
  const zy = (view.height - padding * 2) / Math.max(1, rect.height)
  const zoom = clampZoom(Math.min(zx, zy, 1))
  return {
    zoom,
    panX: (view.width - rect.width * zoom) / 2 - rect.x * zoom,
    panY: (view.height - rect.height * zoom) / 2 - rect.y * zoom,
  }
}

// ワールドレイヤー用の CSS transform(transform-origin: 0 0 前提)
export const viewportMatrix = (vp: Viewport): string =>
  `matrix(${vp.zoom},0,0,${vp.zoom},${vp.panX},${vp.panY})`
