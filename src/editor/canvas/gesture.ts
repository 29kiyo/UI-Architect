import {
  getParentId,
  resolveNode,
  type History,
  type Id,
  type Node,
  type Page,
  type UIDocument,
} from '@/core'
import { createPropsCommand, createReorderCommand, isBaseDevice, type PropWrite } from './commands'
import { measureBoxExtra, measureWorldRect } from './hit'
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
export type GestureInput = { world: Point; px: Point; shift: boolean; alt: boolean }
export type GestureFeedback = { drop?: Line | undefined }

type MoveItem = {
  id: Id
  left: number
  top: number
  clearRight: boolean
  clearBottom: boolean
}
type GBase = { deviceId: Id; startWorld: Point; startPx: Point; key: string; started: boolean }
export type Gesture = GBase &
  (
    | { kind: 'move'; items: MoveItem[] }
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
function moveItem(
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

function positionWrites(it: MoveItem, left?: number, top?: number): PropWrite[] {
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
  return items.length > 0
    ? { ...base(deviceId, startWorld, startPx), kind: 'move', items }
    : undefined
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
      run(
        'move',
        g.items.flatMap((it) => positionWrites(it, it.left + dx, it.top + dy)),
      )
      return {}
    }
    case 'reorder': {
      const t = reorderTarget(g.others, inp.world, g.axis)
      g.beforeId = t.beforeId
      return { drop: t.line }
    }
    case 'resize': {
      const r = resizeRect(
        g.rect,
        g.handle,
        { x: dx, y: dy },
        { keepRatio: inp.shift, fromCenter: inp.alt },
      )
      const [sx, sy] = handleSigns(g.handle)
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
      return {}
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
