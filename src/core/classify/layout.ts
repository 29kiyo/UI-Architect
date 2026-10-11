import type { Node, PropGroup, Props } from '../model'

// 座標は取り込み元のルート左上基準(custom.sourceRect と同じ)
export type Rect = { x: number; y: number; width: number; height: number }
export type LayoutEstimate = {
  mode: 'flex' | 'grid' | 'absolute' | 'none'
  confidence: number
  reason?: string
  direction?: 'row' | 'column'
  gap?: number
  rowGap?: number
  columnGap?: number
  columns?: number
  alignItems?: string
  justifyContent?: string
  padding?: { top: number; right: number; bottom: number; left: number }
}

const TOL = 2
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)]
}
const close = (a: number[]) => a.length === 0 || Math.max(...a) - Math.min(...a) <= TOL
const overlaps = (a: Rect, b: Rect) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > TOL &&
  Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > TOL

// 縦方向に重なる子を同じ行にまとめる。各行は x 昇順の index 配列
function clusterRows(rects: Rect[]): number[][] {
  const idx = rects
    .map((_, i) => i)
    .sort((a, b) => rects[a].y - rects[b].y || rects[a].x - rects[b].x)
  const rows: { items: number[]; top: number; bottom: number }[] = []
  for (const i of idx) {
    const r = rects[i]
    const row = rows[rows.length - 1]
    if (row) {
      const ov = Math.min(r.y + r.height, row.bottom) - Math.max(r.y, row.top)
      if (ov > 0.5 * Math.min(r.height, row.bottom - row.top)) {
        row.items.push(i)
        row.top = Math.min(row.top, r.y)
        row.bottom = Math.max(row.bottom, r.y + r.height)
        continue
      }
    }
    rows.push({ items: [i], top: r.y, bottom: r.y + r.height })
  }
  return rows.map((r) => r.items.sort((a, b) => rects[a].x - rects[b].x))
}

function cross(starts: number[], sizes: number[], innerSize: number) {
  const ends = starts.map((s, i) => s + sizes[i])
  const centers = starts.map((s, i) => s + sizes[i] / 2)
  if (close(starts) && close(sizes) && Math.abs(sizes[0] - innerSize) <= TOL) {
    return { v: 'stretch', ok: true }
  }
  if (close(starts)) return { v: 'flex-start', ok: true }
  if (close(centers)) return { v: 'center', ok: true }
  if (close(ends)) return { v: 'flex-end', ok: true }
  return { v: 'flex-start', ok: false }
}

function main(gaps: number[], leading: number, trailing: number) {
  const gap = Math.max(0, Math.round(median(gaps)))
  // 両端が揃っていて隙間が大きい → space-between(padding は端の余白)
  if (Math.abs(leading - trailing) <= TOL && gap > 16 && gap > Math.max(leading, trailing) * 2) {
    return { ok: true, gap: 0, justify: 'space-between' }
  }
  if (!close(gaps)) return { ok: false, gap: 0, justify: 'flex-start' }
  return { ok: true, gap, justify: 'flex-start' }
}

export function estimateLayout(parent: Rect, rects: Rect[]): LayoutEstimate {
  const n = rects.length
  if (n < 2) return { mode: 'none', confidence: 0 }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (overlaps(rects[i], rects[j]))
        return { mode: 'absolute', confidence: 0.9, reason: 'overlap' }
    }
  }
  const rows = clusterRows(rects)
  // 見た目の順と DOM 順が違うと flex/grid では再現できない
  if (rows.flat().some((v, i) => v !== i)) {
    return { mode: 'absolute', confidence: 0.6, reason: 'order' }
  }
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxR = Math.max(...rects.map((r) => r.x + r.width))
  const maxB = Math.max(...rects.map((r) => r.y + r.height))
  const padding = {
    top: Math.max(0, Math.round(minY - parent.y)),
    right: Math.max(0, Math.round(parent.x + parent.width - maxR)),
    bottom: Math.max(0, Math.round(parent.y + parent.height - maxB)),
    left: Math.max(0, Math.round(minX - parent.x)),
  }
  const innerW = parent.width - padding.left - padding.right
  const innerH = parent.height - padding.top - padding.bottom
  const fallback = (reason: string): LayoutEstimate => ({
    mode: 'absolute',
    confidence: 0.5,
    reason,
  })

  if (rows.length === 1) {
    const gaps = rects.slice(1).map((r, i) => r.x - (rects[i].x + rects[i].width))
    const m = main(gaps, padding.left, padding.right)
    if (!m.ok) return fallback('gaps')
    const c = cross(
      rects.map((r) => r.y),
      rects.map((r) => r.height),
      innerH,
    )
    if (!c.ok) return fallback('cross')
    return {
      mode: 'flex',
      direction: 'row',
      gap: m.gap,
      alignItems: c.v,
      justifyContent: m.justify,
      padding,
      confidence: 0.9,
    }
  }
  if (rows.every((r) => r.length === 1)) {
    const gaps = rects.slice(1).map((r, i) => r.y - (rects[i].y + rects[i].height))
    const m = main(gaps, padding.top, padding.bottom)
    if (!m.ok) return fallback('gaps')
    const c = cross(
      rects.map((r) => r.x),
      rects.map((r) => r.width),
      innerW,
    )
    if (!c.ok) return fallback('cross')
    return {
      mode: 'flex',
      direction: 'column',
      gap: m.gap,
      alignItems: c.v,
      justifyContent: m.justify,
      padding,
      confidence: 0.9,
    }
  }
  const k = rows[0].length
  if (k >= 2 && rows.every((r) => r.length === k)) {
    let aligned = true
    for (let c = 0; c < k; c++) if (!close(rows.map((r) => rects[r[c]].x))) aligned = false
    const colGaps = rows.flatMap((r) =>
      r.slice(1).map((id, i) => rects[id].x - (rects[r[i]].x + rects[r[i]].width)),
    )
    const rowTop = rows.map((r) => Math.min(...r.map((i) => rects[i].y)))
    const rowBottom = rows.map((r) => Math.max(...r.map((i) => rects[i].y + rects[i].height)))
    const rowGaps = rowTop.slice(1).map((t, i) => t - rowBottom[i])
    if (aligned && close(colGaps) && close(rowGaps)) {
      return {
        mode: 'grid',
        columns: k,
        columnGap: Math.max(0, Math.round(median(colGaps))),
        rowGap: Math.max(0, Math.round(median(rowGaps))),
        padding,
        confidence: 0.85,
      }
    }
  }
  return fallback('irregular')
}

const PAD = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'] as const
const MARGIN = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'] as const
const FLEX_GRID = new Set(['flex', 'inline-flex', 'grid', 'inline-grid'])
const POSITIONED = new Set(['relative', 'absolute', 'fixed', 'sticky'])
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const px = (n: number) => `${Math.round(n * 100) / 100}px`

export function rectOf(n: Node): Rect | undefined {
  const r = n.props.custom.sourceRect
  if (!r || typeof r !== 'object' || Array.isArray(r)) return undefined
  const { x, y, width, height } = r as Record<string, unknown>
  if ([x, y, width, height].some((v) => typeof v !== 'number')) return undefined
  return { x, y, width, height } as Rect
}

// 推定結果 → props.layout に入れる値
export function layoutPropsOf(est: LayoutEstimate): PropGroup {
  const g: PropGroup = {}
  if (est.mode === 'flex' && est.direction) {
    g.display = 'flex'
    g.flexDirection = est.direction
    if (est.alignItems) g.alignItems = est.alignItems
    if (est.justifyContent) g.justifyContent = est.justifyContent
    if (est.gap) g[est.direction === 'row' ? 'columnGap' : 'rowGap'] = px(est.gap)
  } else if (est.mode === 'grid' && est.columns) {
    g.display = 'grid'
    g.gridTemplateColumns = `repeat(${est.columns}, 1fr)`
    if (est.columnGap) g.columnGap = px(est.columnGap)
    if (est.rowGap) g.rowGap = px(est.rowGap)
  }
  const p = est.padding
  if (p) {
    if (p.top) g.paddingTop = px(p.top)
    if (p.right) g.paddingRight = px(p.right)
    if (p.bottom) g.paddingBottom = px(p.bottom)
    if (p.left) g.paddingLeft = px(p.left)
  }
  return g
}

type Groups = Partial<Record<keyof Props, PropGroup>>
// layout/position/size の元の値を最初の1回だけ退避して変更する
function edit(n: Node, groups: Groups, mark: PropGroup = {}): Node {
  const original =
    n.props.custom.layoutOriginal ??
    ({
      layout: n.props.layout,
      position: n.props.position,
      size: n.props.size,
    } as PropGroup[string])
  return {
    ...n,
    props: {
      ...n.props,
      ...groups,
      custom: { ...n.props.custom, layoutOriginal: original, ...mark },
    },
  }
}
const zeroMargins = (layout: PropGroup): PropGroup => {
  const out = { ...layout }
  for (const k of MARGIN) if (k in out) out[k] = '0px'
  return out
}

export type ArrangeLayoutResult = {
  nodes: Node[]
  warnings: string[]
  estimated: number
  applied: number
}

// nodes[0] はルート(rect 無しのため対象外)。入力は変更せず新しい配列を返す
export function arrangeLayout(nodes: Node[]): ArrangeLayoutResult {
  const out = new Map(nodes.map((n) => [n.id, n]))
  let estimated = 0
  let applied = 0
  let overlapCount = 0

  for (const orig of nodes) {
    const parent = out.get(orig.id) as Node
    const pr = rectOf(parent)
    if (!pr || parent.type !== 'element' || parent.props.custom.layoutApplied === true) continue
    const kids = parent.children.map((id) => out.get(id) as Node).filter((c) => c && !c.hidden)
    if (kids.length < 2) continue
    const rects = kids.map(rectOf)
    if (rects.some((r) => !r)) continue
    if (kids.some((c) => ['absolute', 'fixed'].includes(str(c.props.position.position)))) continue

    const est = estimateLayout(pr, rects as Rect[])
    if (est.mode === 'none') continue
    estimated++
    if (est.reason === 'overlap') overlapCount++
    const withEstimate = {
      ...parent,
      props: {
        ...parent.props,
        custom: { ...parent.props.custom, layoutEstimate: JSON.parse(JSON.stringify(est)) },
      },
    }
    out.set(parent.id, withEstimate)
    if (est.confidence < 0.6 || FLEX_GRID.has(str(parent.props.layout.display))) continue

    const base = { ...withEstimate.props.layout }
    for (const k of [...PAD, 'rowGap', 'columnGap']) delete base[k]
    if (est.mode === 'absolute') {
      const positioned = POSITIONED.has(str(parent.props.position.position))
      out.set(
        parent.id,
        edit(
          withEstimate,
          {
            layout: { ...base, boxSizing: 'border-box' },
            position: { ...parent.props.position, ...(positioned ? {} : { position: 'relative' }) },
            size: { ...parent.props.size, height: px(pr.height) },
          },
          { layoutApplied: true },
        ),
      )
      kids.forEach((c, i) => {
        const r = (rects as Rect[])[i]
        out.set(
          c.id,
          edit(c, {
            layout: { ...zeroMargins(c.props.layout), boxSizing: 'border-box' },
            position: {
              ...c.props.position,
              position: 'absolute',
              left: px(r.x - pr.x),
              top: px(r.y - pr.y),
            },
            size: { ...c.props.size, width: px(r.width), height: px(r.height) },
          }),
        )
      })
    } else {
      out.set(
        parent.id,
        edit(withEstimate, { layout: { ...base, ...layoutPropsOf(est) } }, { layoutApplied: true }),
      )
      for (const c of kids) out.set(c.id, edit(c, { layout: zeroMargins(c.props.layout) }))
    }
    applied++
  }

  const warnings: string[] = []
  if (overlapCount > 0) {
    warnings.push(`子要素の重なりを ${overlapCount} 件のコンテナで検出(絶対配置として扱います)`)
  }
  return { nodes: nodes.map((n) => out.get(n.id) as Node), warnings, estimated, applied }
}

// 適用前の layout/position/size に戻す(推定結果の記録も消す)
export function revertLayout(nodes: Node[]): Node[] {
  return nodes.map((n) => {
    const o = n.props.custom.layoutOriginal
    if (!o || typeof o !== 'object' || Array.isArray(o)) return n
    const orig = o as Record<string, PropGroup>
    const custom = { ...n.props.custom }
    delete custom.layoutOriginal
    delete custom.layoutApplied
    delete custom.layoutEstimate
    return {
      ...n,
      props: {
        ...n.props,
        layout: orig.layout ?? n.props.layout,
        position: orig.position ?? n.props.position,
        size: orig.size ?? n.props.size,
        custom,
      },
    }
  })
}

// ルート直下でデバイス幅を超える要素に maxWidth: 100% を足す
export function fixOverflow(
  nodes: Node[],
  deviceWidth: number,
): { nodes: Node[]; warnings: string[] } {
  const warnings: string[] = []
  const top = new Set(nodes[0]?.children ?? [])
  const out = nodes.map((n) => {
    if (!top.has(n.id)) return n
    const r = rectOf(n)
    if (!r || r.x + r.width <= deviceWidth + TOL) return n
    warnings.push(`「${n.name}」がデバイス幅(${deviceWidth}px)を超えています`)
    if (n.props.size.maxWidth !== undefined) return n
    return { ...n, props: { ...n.props, size: { ...n.props.size, maxWidth: '100%' } } }
  })
  return { nodes: out, warnings }
}
