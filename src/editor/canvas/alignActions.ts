import { getParentId, resolveNode, type Id } from '@/core'
import { alignDeltas, alignEligible, distributeDeltas, type AlignKind, type Item } from './align'
import type { EditEnv } from './actions'
import { createAutoLayoutCommand, planAutoLayout, type PlanFailure } from './autoLayout'
import { createPropsCommand, isBaseDevice } from './commands'
import { moveItem, positionWrites, type GestureCtx, type MoveItem } from './gesture'
import { measureWorldRect } from './hit'
import { selectionStore } from './selection'
import { moveKind } from './transform'
import type { Viewport } from './viewport'

export type AlignOp = AlignKind | 'distribute-h' | 'distribute-v'

function current(env: EditEnv) {
  const sel = selectionStore.getState()
  const deviceId = sel.activeDeviceId ?? env.doc.devices[0]?.id
  const ids = sel.selectedIds.filter((id) => id in env.page.nodes && id !== env.page.rootNodeId)
  return { deviceId, ids }
}

// 整列/等間隔。実行したら true
export function runAlign(env: EditEnv, el: HTMLElement, vp: Viewport, op: AlignOp): boolean {
  const { doc, page, history } = env
  const { deviceId, ids } = current(env)
  if (!deviceId || !alignEligible(page, deviceId, ids)) return false
  const ctx: GestureCtx = { doc, page, history, el, vp }
  const rects: Item[] = []
  const moves = new Map<Id, MoveItem>()
  for (const id of ids) {
    const rect = measureWorldRect(el, vp, deviceId, id)
    const node = resolveNode(page, deviceId, id)
    const pid = getParentId(page, id)
    const parent = pid ? resolveNode(page, deviceId, pid) : undefined
    if (!rect || !node || !parent) return false
    const kind = moveKind(node.props.position.position, parent.props.layout.display)
    if (kind !== 'absolute' && kind !== 'offset') return false
    rects.push({ id, rect })
    moves.set(id, moveItem(ctx, deviceId, node, kind))
  }
  const deltas =
    op === 'distribute-h'
      ? distributeDeltas(rects, 'x')
      : op === 'distribute-v'
        ? distributeDeltas(rects, 'y')
        : alignDeltas(rects, op)
  const writes = deltas.flatMap((d) => {
    const it = moves.get(d.id)
    const mx = Math.abs(d.dx) >= 0.01
    const my = Math.abs(d.dy) >= 0.01
    if (!it || (!mx && !my)) return []
    return positionWrites(it, mx ? it.left + d.dx : undefined, my ? it.top + d.dy : undefined)
  })
  if (writes.length === 0) return false
  return history.execute(
    createPropsCommand({
      name: op.startsWith('distribute') ? 'distribute' : 'align',
      pageId: page.id,
      deviceId,
      base: isBaseDevice(doc.devices, deviceId),
      writes,
    }),
  )
}

// オートレイアウト化。成功は 'ok'、できない理由は PlanFailure
export function runAutoLayout(env: EditEnv, el: HTMLElement, vp: Viewport): 'ok' | PlanFailure {
  const { page, history } = env
  const { deviceId, ids } = current(env)
  if (!deviceId) return 'ineligible'
  const plan = planAutoLayout(page, deviceId, ids, (id) => measureWorldRect(el, vp, deviceId, id))
  if (typeof plan === 'string') return plan
  const cmd = createAutoLayoutCommand(page.id, plan)
  history.execute(cmd.command)
  if (cmd.created[0]) selectionStore.getState().pick(cmd.created[0], deviceId, false)
  return 'ok'
}
