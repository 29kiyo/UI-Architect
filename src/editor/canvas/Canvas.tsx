import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { resolveNode, type History, type UIDocument } from '@/core'
import { layoutArtboards, unionRect } from './artboard'
import { CanvasOverlay } from './CanvasOverlay'
import { Ruler } from './Ruler'
import { NodeView } from './NodeView'
import { hitFromElement, measureWorldRect } from './hit'
import {
  finishGesture,
  startMove,
  startResize,
  startRotate,
  updateGesture,
  type Gesture,
  type GestureCtx,
} from './gesture'
import { selectionStore, useSelection } from './selection'
import { getRotation, isHandleId, type Line } from './transform'
import { artboardForMarquee, marqueeTargets, normalizeRect, resolveTarget } from './target'
import {
  DEFAULT_VIEWPORT,
  fitRect,
  panBy,
  screenToWorld,
  viewportMatrix,
  zoomAt,
  type Point,
  type WorldRect,
} from './viewport'

type Props = {
  doc: UIDocument
  history: History
  pageId?: string | undefined
  language: 'ja' | 'en'
  height?: number | string
}

const TEXT = {
  ja: {
    fit: '全体表示',
    reset: '100%',
    zoomIn: '拡大',
    zoomOut: '縮小',
    hint: 'Ctrl+ホイール: ズーム / Space+ドラッグ: パン / ドラッグ中 Ctrl: スナップ解除',
    snap: 'スナップ',
    ruler: '定規',
  },
  en: {
    fit: 'Fit',
    reset: '100%',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    hint: 'Ctrl+wheel: zoom / Space+drag: pan / hold Ctrl while dragging: no snap',
    snap: 'Snap',
    ruler: 'Rulers',
  },
} as const

export function Canvas({ doc, history, pageId, language, height = '70vh' }: Props) {
  const t = TEXT[language]
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const fitted = useRef(false)
  const [vp, setVp] = useState(DEFAULT_VIEWPORT)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const selectedIds = useSelection((s) => s.selectedIds)
  const activeDeviceId = useSelection((s) => s.activeDeviceId)
  const hover = useSelection((s) => s.hover)
  const marquee = useRef<{ start: Point; startPx: Point; shift: boolean; moved: boolean } | null>(
    null,
  )
  const [marqueeRect, setMarqueeRect] = useState<WorldRect | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const [drop, setDrop] = useState<Line | undefined>(undefined)
  const [guides, setGuides] = useState<Line[]>([])
  const [snapOn, setSnapOn] = useState(true)
  const [rulerOn, setRulerOn] = useState(true)
  const [boxes, setBoxes] = useState<{ selected: WorldRect[]; hover?: WorldRect | undefined }>({
    selected: [],
  })

  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]
  const artboards = useMemo(() => layoutArtboards(doc.devices), [doc.devices])

  // Undo 等で消えたノードを選択から外す
  useEffect(() => {
    if (page) selectionStore.getState().prune((id) => id in page.nodes)
  }, [page])

  // 選択枠・ホバー枠は DOM の実測値(ワールド座標)で描く
  const measure = useCallback(() => {
    const el = ref.current
    if (!el || !page) {
      setBoxes({ selected: [] })
      return
    }
    const selected: WorldRect[] = []
    if (activeDeviceId) {
      for (const id of selectedIds) {
        const r = measureWorldRect(el, vp, activeDeviceId, id)
        if (r) selected.push(r)
      }
    }
    const h = hover ? measureWorldRect(el, vp, hover.deviceId, hover.id) : undefined
    setBoxes({ selected, hover: h })
  }, [page, vp, selectedIds, activeDeviceId, hover])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  // ハンドルは単一選択のときだけ。回転済みはリサイズ不可(回転ハンドルのみ)
  const handleInfo = useMemo(() => {
    const id = selectedIds[0]
    const rect = boxes.selected[0]
    if (!page || !activeDeviceId || !id || !rect) return undefined
    if (selectedIds.length !== 1 || boxes.selected.length !== 1) return undefined
    const tf = resolveNode(page, activeDeviceId, id)?.props.transform.transform
    return { rect, rotated: getRotation(typeof tf === 'string' ? tf : '') !== 0 }
  }, [page, activeDeviceId, selectedIds, boxes.selected])

  const fit = useCallback((): boolean => {
    const el = ref.current
    const u = unionRect(artboards.map((a) => a.rect))
    if (!el || !u) return false
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    setVp(fitRect(u, { width: r.width, height: r.height }))
    return true
  }, [artboards])

  useEffect(() => {
    if (!fitted.current) fitted.current = fit()
  }, [fit])

  // ホイール: Ctrl/⌘ でカーソル中心ズーム、それ以外はパン(preventDefault のため非 passive)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        const pt = { x: e.clientX - r.left, y: e.clientY - r.top }
        setVp((v) => zoomAt(v, pt, v.zoom * Math.exp(-e.deltaY * 0.002)))
      } else {
        setVp((v) => panBy(v, -e.deltaX, -e.deltaY))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomCenter = (factor: number) => {
    const r = ref.current?.getBoundingClientRect()
    const pt = r ? { x: r.width / 2, y: r.height / 2 } : { x: 0, y: 0 }
    setVp((v) => zoomAt(v, pt, v.zoom * factor))
  }

  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const el = ref.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return screenToWorld(vp, {
      x: e.clientX - r.left - el.clientLeft,
      y: e.clientY - r.top - el.clientTop,
    })
  }

  const ptr = (e: { clientX: number; clientY: number }): Point => ({ x: e.clientX, y: e.clientY })
  const makeCtx = (): GestureCtx | undefined => {
    const el = ref.current
    return el && page ? { doc, page, history, el, vp } : undefined
  }

  const beginHandle = (e: React.PointerEvent<HTMLDivElement>, name: string) => {
    const c = makeCtx()
    const id = selectedIds[0]
    if (!c || !activeDeviceId || !id || selectedIds.length !== 1) return
    const world = toWorld(e)
    gesture.current =
      name === 'rotate'
        ? (startRotate(c, activeDeviceId, id, world, ptr(e)) ?? null)
        : isHandleId(name)
          ? (startResize(c, activeDeviceId, id, name, world, ptr(e)) ?? null)
          : null
  }

  // 左ボタン: ノード上なら即選択、空白なら矩形選択の開始
  const beginSelect = (e: React.PointerEvent<HTMLDivElement>) => {
    const sel = selectionStore.getState()
    const hit = hitFromElement(e.target)
    const target =
      hit && page ? resolveTarget(page, hit.nodeId, sel.selectedIds, 'click') : undefined
    if (hit && target) {
      // 選択済みノードを(Shift なしで)押した場合は、複数選択を保ったまま移動できるようにする
      const keep =
        !e.shiftKey && sel.activeDeviceId === hit.deviceId && sel.selectedIds.includes(target)
      if (!keep) sel.pick(target, hit.deviceId, e.shiftKey)
      const c = makeCtx()
      const ids = selectionStore.getState().selectedIds
      if (c && ids.includes(target)) {
        gesture.current = startMove(c, hit.deviceId, ids, toWorld(e), ptr(e)) ?? null
      }
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    marquee.current = {
      start: toWorld(e),
      startPx: { x: e.clientX, y: e.clientY },
      shift: e.shiftKey,
      moved: false,
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    ref.current?.focus()
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { x: e.clientX, y: e.clientY }
      setPanning(true)
    } else if (e.button === 0) {
      const h = e.target instanceof Element ? e.target.closest('[data-handle]') : null
      if (h) beginHandle(e, h.getAttribute('data-handle') ?? '')
      else beginSelect(e)
    }
  }

  const updateHover = (e: React.PointerEvent<HTMLDivElement>) => {
    const sel = selectionStore.getState()
    const hit = hitFromElement(e.target)
    const id = hit && page ? resolveTarget(page, hit.nodeId, sel.selectedIds, 'click') : undefined
    sel.setHover(hit && id ? { id, deviceId: hit.deviceId } : null)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (g) {
      const c = makeCtx()
      if (c) {
        const input = {
          world: toWorld(e),
          px: ptr(e),
          shift: e.shiftKey,
          alt: e.altKey,
          snap: snapOn && !e.ctrlKey && !e.metaKey,
        }
        const fb = updateGesture(c, g, input)
        // ダブルクリックの対象を壊さないよう、実際にドラッグが始まってからキャプチャする
        if (g.started && !e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.setPointerCapture(e.pointerId)
        }
        setDrop(fb.drop)
        setGuides(fb.guides ?? [])
      }
      return
    }
    const d = drag.current
    if (d) {
      drag.current = { x: e.clientX, y: e.clientY }
      setVp((v) => panBy(v, e.clientX - d.x, e.clientY - d.y))
      return
    }
    const m = marquee.current
    if (m) {
      if (!m.moved && Math.hypot(e.clientX - m.startPx.x, e.clientY - m.startPx.y) < 3) return
      m.moved = true
      setMarqueeRect(normalizeRect(m.start, toWorld(e)))
      return
    }
    updateHover(e)
  }

  const endPointer = (e: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    drag.current = null
    setPanning(false)
    const g = gesture.current
    if (g) {
      gesture.current = null
      setDrop(undefined)
      setGuides([])
      const c = makeCtx()
      if (c && commit) finishGesture(c, g)
      return
    }
    const m = marquee.current
    marquee.current = null
    setMarqueeRect(null)
    if (!m || !page || !commit) return
    const sel = selectionStore.getState()
    if (!m.moved) {
      if (!m.shift) sel.clear() // 空白クリックで解除
      return
    }
    const rect = normalizeRect(m.start, toWorld(e))
    const ab = artboardForMarquee(artboards, m.start, rect)
    const el = ref.current
    if (!ab || !el) return
    const rects = new Map<string, WorldRect>()
    for (const id of page.nodes[page.rootNodeId]?.children ?? []) {
      const r = measureWorldRect(el, vp, ab.deviceId, id)
      if (r) rects.set(id, r)
    }
    sel.pickMany(marqueeTargets(page, rects, rect), ab.deviceId, m.shift)
  }

  // ダブルクリック: 選択中ノードの 1 つ下へ潜る
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const hit = hitFromElement(e.target)
    if (!hit || !page) return
    const sel = selectionStore.getState()
    const id = resolveTarget(page, hit.nodeId, sel.selectedIds, 'dive')
    if (id) sel.pick(id, hit.deviceId, false)
  }

  return (
    <section>
      <div>
        <button type="button" onClick={() => zoomCenter(1 / 1.25)}>
          {t.zoomOut}
        </button>{' '}
        <span>{Math.round(vp.zoom * 100)}%</span>{' '}
        <button type="button" onClick={() => zoomCenter(1.25)}>
          {t.zoomIn}
        </button>{' '}
        <button type="button" onClick={() => fit()}>
          {t.fit}
        </button>{' '}
        <button type="button" onClick={() => setVp((v) => zoomAt(v, { x: 0, y: 0 }, 1))}>
          {t.reset}
        </button>{' '}
        <label>
          <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} />{' '}
          {t.snap}
        </label>{' '}
        <label>
          <input type="checkbox" checked={rulerOn} onChange={(e) => setRulerOn(e.target.checked)} />{' '}
          {t.ruler}
        </label>{' '}
        <small>{t.hint}</small>
      </div>
      <div
        ref={ref}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Escape') selectionStore.getState().clear()
          if (e.code === 'Space') {
            e.preventDefault()
            setSpaceDown(true)
          }
        }}
        onKeyUp={(e) => {
          if (e.code === 'Space') setSpaceDown(false)
        }}
        onBlur={() => setSpaceDown(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e, true)}
        onPointerCancel={(e) => endPointer(e, false)}
        onPointerLeave={() => selectionStore.getState().setHover(null)}
        onDoubleClick={onDoubleClick}
        style={{
          position: 'relative',
          overflow: 'hidden',
          height,
          border: '1px solid var(--border)',
          background: 'rgba(128,128,128,0.12)',
          cursor: panning ? 'grabbing' : spaceDown ? 'grab' : 'default',
          touchAction: 'none',
          outline: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transformOrigin: '0 0',
            transform: viewportMatrix(vp),
          }}
        >
          {page &&
            artboards.map((a) => (
              <div
                key={a.deviceId}
                data-device-id={a.deviceId}
                style={{
                  position: 'absolute',
                  left: a.rect.x,
                  top: a.rect.y,
                  width: a.rect.width,
                  height: a.rect.height,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    paddingBottom: 4,
                    fontSize: 12 / vp.zoom,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.name} ({a.rect.width}×{a.rect.height})
                </div>
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    background: '#fff',
                    color: '#000',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
                  }}
                >
                  <NodeView page={page} deviceId={a.deviceId} nodeId={page.rootNodeId} />
                </div>
              </div>
            ))}
        </div>
        <CanvasOverlay
          viewport={vp}
          artboards={artboards}
          selected={boxes.selected}
          hover={boxes.hover}
          marquee={marqueeRect ?? undefined}
          handles={handleInfo}
          drop={drop}
          guides={guides}
        />
        {rulerOn && <Ruler viewport={vp} />}
      </div>
    </section>
  )
}
