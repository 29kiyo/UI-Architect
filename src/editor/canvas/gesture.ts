import {
  getDescendantIds,
  getParentId,
  resolveNode,
  type History,
  type Id,
  type Node,
  type Page,
  type UIDocument,
} from '@/core'
import { createPropsCommand, createReorderCommand, isBaseDevice, type PropWrite } from './commands'
import { layoutArtboards, unionRect } from './artboard'
import { measureAllRects, measureBoxExtra, measureWorldRect } from './hit'
import { snapRect } from './snap'
import {
  angleDeg,
  flexAxis,
  getRotation,
  handleSigns,
  moveKind,
  normalizeAngle,
  parsePx,
  reorderTarget,
  resizeRect,
  setRotation,
  type HandleId,
  type Line,
  type Sibling,
} from './transform'
import type { Point, Viewport, WorldRect } from './viewport'

export type GestureCtx = {
  doc: UIDocument
  page: Page
  history: History
  el: HTMLElement
  vp: Viewport
}
export type GestureInput = {
  world: Point
  px: Point
  shift: boolean
  alt: boolean
  snap: boolean // false(Ctrl 押下中など)ならスナップしない
}
export type GestureFeedback = { drop?: Line | undefined; guides?: Line[] | undefined }

export type MoveItem = {
  id: Id
  left: number
  top: number
  clearRight: boolean
  clearBottom: boolean
}
type GBase = { deviceId: Id; startWorld: Point; startPx: Point; key: string; started: boolean }
export type Gesture = GBase &
  (
    | {
        kind: 'move'
        items: MoveItem[]
        rect: WorldRect | undefined
        targets: WorldRect[]
        art: WorldRect | undefined
      }
    | {
        kind: 'reorder'
        id: Id
        parentId: Id
        others: Sibling[]
        axis: 'x' | 'y'
        beforeId?: Id | undefined
      }
    | {
        kind: 'resize'
        id: Id
        handle: HandleId
        rect: WorldRect
        extra: { w: number; h: number }
        abs: MoveItem | undefined
        targets: WorldRect[]
        art: WorldRect | undefined
      }
    | {
        kind: 'rotate'
        id: Id
        center: Point
        startAngle: number
        startRot: number
        startTransform: string
      }
  )

const THRESHOLD = 3
const SNAP_PX = 6 // スナップのしきい値(画面 px)
let seq = 0
const base = (deviceId: Id, startWorld: Point, startPx: Point): GBase => ({
  deviceId,
  startWorld,
  startPx,
  key: `gesture:${++seq}`,
  started: false,
})
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const px = (n: number) => `${Math.round(n)}px`
const isSet = (v: unknown) => v !== undefined && v !== '' && v !== 'auto'

function parentOf(ctx: GestureCtx, deviceId: Id, id: Id) {
  const pid = getParentId(ctx.page, id)
  return { pid, parent: pid ? resolveNode(ctx.page, deviceId, pid) : undefined }
}

// left/top の開始値。px で書かれていなければ実測(親の矩形からの相対。近似)
export function moveItem(
  ctx: GestureCtx,
  deviceId: Id,
  node: Node,
  kind: 'absolute' | 'offset',
): MoveItem {
  const p = node.props.position
  let left = parsePx(p.left)
  let top = parsePx(p.top)
  if (kind === 'absolute' && (left === undefined || top === undefined)) {
    const { pid } = parentOf(ctx, deviceId, node.id)
    const r = measureWorldRect(ctx.el, ctx.vp, deviceId, node.id)
    const pr = pid ? measureWorldRect(ctx.el, ctx.vp, deviceId, pid) : undefined
    left ??= r ? r.x - (pr?.x ?? 0) : 0
    top ??= r ? r.y - (pr?.y ?? 0) : 0
  }
  return {
    id: node.id,
    left: left ?? 0,
    top: top ?? 0,
    // right/bottom が効いていると left/top を書いても伸び縮みするので auto に戻す
    clearRight: kind === 'absolute' && isSet(p.right),
    clearBottom: kind === 'absolute' && isSet(p.bottom),
  }
}

export function positionWrites(it: MoveItem, left?: number, top?: number): PropWrite[] {
  const out: PropWrite[] = []
  if (left !== undefined) {
    out.push({ nodeId: it.id, group: 'position', key: 'left', value: px(left) })
    if (it.clearRight) out.push({ nodeId: it.id, group: 'position', key: 'right', value: 'auto' })
  }
  if (top !== undefined) {
    out.push({ nodeId: it.id, group: 'position', key: 'top', value: px(top) })
    if (it.clearBottom) out.push({ nodeId: it.id, group: 'position', key: 'bottom', value: 'auto' })
  }
  return out
}

// スナップ対象(同じデバイスの他ノード+アートボード枠)。ジェスチャ開始時に 1 回だけ測る
function snapContext(ctx: GestureCtx, deviceId: Id, moving: Id[]) {
  const ex = new Set<Id>()
  for (const id of moving) {
    ex.add(id)
    for (const d of getDescendantIds(ctx.page, id)) ex.add(d)
  }
  const art = layoutArtboards(ctx.doc.devices).find((a) => a.deviceId === deviceId)?.rect
  const targets = measureAllRects(ctx.el, ctx.vp, deviceId, ex)
  if (art) targets.push(art)
  return { targets, art }
}

export function startMove(
  ctx: GestureCtx,
  deviceId: Id,
  ids: Id[],
  startWorld: Point,
  startPx: Point,
): Gesture | undefined {
  const items: MoveItem[] = []
  for (const id of ids) {
    const node = resolveNode(ctx.page, deviceId, id)
    const { pid, parent } = parentOf(ctx, deviceId, id)
    if (!node || !pid || !parent) continue
    const kind = moveKind(node.props.position.position, parent.props.layout.display)
    if (kind === 'reorder') {
      if (ids.length !== 1) continue
      const others = parent.children
        .filter((c) => c !== id)
        .flatMap((c): Sibling[] => {
          const rect = measureWorldRect(ctx.el, ctx.vp, deviceId, c)
          return rect ? [{ id: c, rect }] : []
        })
      return {
        ...base(deviceId, startWorld, startPx),
        kind: 'reorder',
        id,
        parentId: pid,
        others,
        axis: flexAxis(parent.props.layout),
      }
    }
    if (kind === 'absolute' || kind === 'offset') items.push(moveItem(ctx, deviceId, node, kind))
  }
  if (items.length === 0) return undefined
  const movingIds = items.map((i) => i.id)
  const rect = unionRect(
    movingIds.flatMap((id) => {
      const r = measureWorldRect(ctx.el, ctx.vp, deviceId, id)
      return r ? [r] : []
    }),
  )
  return {
    ...base(deviceId, startWorld, startPx),
    kind: 'move',
    items,
    rect,
    ...snapContext(ctx, deviceId, movingIds),
  }
}

export function startResize(
  ctx: GestureCtx,
  deviceId: Id,
  id: Id,
  handle: HandleId,
  startWorld: Point,
  startPx: Point,
): Gesture | undefined {
  const node = resolveNode(ctx.page, deviceId, id)
  const rect = measureWorldRect(ctx.el, ctx.vp, deviceId, id)
  if (!node || !rect) return undefined
  if (getRotation(str(node.props.transform.transform)) !== 0) return undefined
  const { parent } = parentOf(ctx, deviceId, id)
  const kind = moveKind(node.props.position.position, parent?.props.layout.display)
  return {
    ...base(deviceId, startWorld, startPx),
    kind: 'resize',
    id,
    handle,
    rect,
    extra: measureBoxExtra(ctx.el, deviceId, id),
    abs: kind === 'absolute' ? moveItem(ctx, deviceId, node, 'absolute') : undefined,
    ...snapContext(ctx, deviceId, [id]),
  }
}

export function startRotate(
  ctx: GestureCtx,
  deviceId: Id,
  id: Id,
  startWorld: Point,
  startPx: Point,
): Gesture | undefined {
  const node = resolveNode(ctx.page, deviceId, id)
  const rect = measureWorldRect(ctx.el, ctx.vp, deviceId, id)
  if (!node || !rect) return undefined
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  const t = str(node.props.transform.transform)
  return {
    ...base(deviceId, startWorld, startPx),
    kind: 'rotate',
    id,
    center,
    startAngle: angleDeg(center, startWorld),
    startRot: getRotation(t),
    startTransform: t,
  }
}

// ポインタ移動ごとに呼ぶ。移動/リサイズ/回転は coalesce された Command で即時反映、並び替えは指標だけ
export function updateGesture(ctx: GestureCtx, g: Gesture, inp: GestureInput): GestureFeedback {
  if (!g.started) {
    if (Math.hypot(inp.px.x - g.startPx.x, inp.px.y - g.startPx.y) < THRESHOLD) return {}
    g.started = true
  }
  const dx = inp.world.x - g.startWorld.x
  const dy = inp.world.y - g.startWorld.y
  const run = (name: string, writes: PropWrite[]) =>
    ctx.history.execute(
      createPropsCommand({
        name,
        pageId: ctx.page.id,
        deviceId: g.deviceId,
        base: isBaseDevice(ctx.doc.devices, g.deviceId),
        writes,
        coalesceKey: g.key,
      }),
    )
  switch (g.kind) {
    case 'move': {
      let mx = dx
      let my = dy
      let guides: Line[] | undefined
      if (inp.snap && g.rect) {
        const res = snapRect({ ...g.rect, x: g.rect.x + dx, y: g.rect.y + dy }, g.targets, {
          threshold: SNAP_PX / ctx.vp.zoom,
        })
        mx += res.dx
        my += res.dy
        guides = res.lines
      }
      run(
        'move',
        g.items.flatMap((it) => positionWrites(it, it.left + mx, it.top + my)),
      )
      return { guides }
    }
    case 'reorder': {
      const t = reorderTarget(g.others, inp.world, g.axis)
      g.beforeId = t.beforeId
      return { drop: t.line }
    }
    case 'resize': {
      const [sx, sy] = handleSigns(g.handle)
      let ddx = dx
      let ddy = dy
      let guides: Line[] | undefined
      // 動かしている辺だけを吸着(比率固定中は吸着しない)
      if (inp.snap && !inp.shift) {
        const cur = resizeRect(g.rect, g.handle, { x: dx, y: dy }, { fromCenter: inp.alt })
        const res = snapRect(cur, g.targets, {
          threshold: SNAP_PX / ctx.vp.zoom,
          gaps: false,
          lines: { x: sx > 0 ? [1] : sx < 0 ? [0] : [], y: sy > 0 ? [1] : sy < 0 ? [0] : [] },
        })
        ddx += res.dx
        ddy += res.dy
        guides = res.lines
      }
      const r = resizeRect(
        g.rect,
        g.handle,
        { x: ddx, y: ddy },
        { keepRatio: inp.shift, fromCenter: inp.alt },
      )
      const writes: PropWrite[] = []
      if (sx !== 0 || inp.shift) {
        const value = px(Math.max(0, r.width - g.extra.w))
        writes.push({ nodeId: g.id, group: 'size', key: 'width', value })
      }
      if (sy !== 0 || inp.shift) {
        const value = px(Math.max(0, r.height - g.extra.h))
        writes.push({ nodeId: g.id, group: 'size', key: 'height', value })
      }
      if (g.abs) {
        const mx = Math.abs(r.x - g.rect.x) > 0.01
        const my = Math.abs(r.y - g.rect.y) > 0.01
        writes.push(
          ...positionWrites(
            g.abs,
            mx ? g.abs.left + (r.x - g.rect.x) : undefined,
            my ? g.abs.top + (r.y - g.rect.y) : undefined,
          ),
        )
      }
      run('resize', writes)
      return { guides }
    }
    case 'rotate': {
      let rot = g.startRot + (angleDeg(g.center, inp.world) - g.startAngle)
      if (inp.shift) rot = Math.round(rot / 15) * 15
      rot = Math.round(normalizeAngle(rot) * 10) / 10
      const value = setRotation(g.startTransform, rot) || 'none'
      run('rotate', [{ nodeId: g.id, group: 'transform', key: 'transform', value }])
      return {}
    }
  }
  return {}
}

// ポインタを離したとき。並び替えだけここで確定する
export function finishGesture(ctx: GestureCtx, g: Gesture): void {
  if (g.kind !== 'reorder' || !g.started) return
  ctx.history.execute(
    createReorderCommand({
      pageId: ctx.page.id,
      deviceId: g.deviceId,
      base: isBaseDevice(ctx.doc.devices, g.deviceId),
      parentId: g.parentId,
      nodeId: g.id,
      beforeId: g.beforeId,
    }),
  )
}
