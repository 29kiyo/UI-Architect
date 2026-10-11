import { getAncestorIds, type Id, type Page } from '@/core'
import type { Artboard } from './artboard'
import type { Point, WorldRect } from './viewport'

// ルートの子から hit まで(ルートは含まない)。hit がルート/不明なら []
// 注: getAncestorIds は呼ぶたびに親マップを作る(O(n))。性能対応は 5-H
export function pathBelowRoot(page: Page, hitId: Id): Id[] {
  if (hitId === page.rootNodeId || !page.nodes[hitId]) return []
  const chain = [hitId, ...getAncestorIds(page, hitId)] // hit → root
  const rootIdx = chain.indexOf(page.rootNodeId)
  if (rootIdx < 0) return []
  return chain.slice(0, rootIdx).reverse()
}

// ヒットした要素から「実際に選ぶノード」を決める。選べなければ undefined(= 空白扱い)
// click: 最上位の祖先。ただし選択中ノードの内側(自身含む)なら選択を維持
// dive : 選択中ノードの 1 つ下へ潜る(選択が無ければ最上位)
export function resolveTarget(
  page: Page,
  hitId: Id,
  selectedIds: readonly Id[],
  mode: 'click' | 'dive',
): Id | undefined {
  const path = pathBelowRoot(page, hitId)
  if (path.length === 0) return undefined
  if (path.some((id) => page.nodes[id]?.locked)) return undefined // ロック配下は選択不可
  const selected = new Set(selectedIds)
  let sel = -1
  path.forEach((id, i) => {
    if (selected.has(id)) sel = i
  })
  if (sel < 0) return path[0]
  return mode === 'click' ? path[sel] : path[Math.min(sel + 1, path.length - 1)]
}

export const rectsIntersect = (a: WorldRect, b: WorldRect): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

export const normalizeRect = (a: Point, b: Point): WorldRect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
})

// 矩形選択の対象: ルート直下のうち、矩形と交差するもの(hidden/locked は除外)
export function marqueeTargets(
  page: Page,
  rects: ReadonlyMap<Id, WorldRect>,
  marquee: WorldRect,
): Id[] {
  const root = page.nodes[page.rootNodeId]
  const out: Id[] = []
  for (const id of root?.children ?? []) {
    const n = page.nodes[id]
    const r = rects.get(id)
    if (!n || n.hidden || n.locked || !r) continue
    if (rectsIntersect(r, marquee)) out.push(id)
  }
  return out
}

// 矩形選択を行うデバイス: 開始点を含むアートボード、無ければ交差する最初のもの
export function artboardForMarquee(
  artboards: Artboard[],
  start: Point,
  marquee: WorldRect,
): Artboard | undefined {
  const inside = artboards.find(
    (a) =>
      start.x >= a.rect.x &&
      start.x <= a.rect.x + a.rect.width &&
      start.y >= a.rect.y &&
      start.y <= a.rect.y + a.rect.height,
  )
  return inside ?? artboards.find((a) => rectsIntersect(a.rect, marquee))
}
