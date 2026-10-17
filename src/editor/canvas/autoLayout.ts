import {
  allPages,
  estimateLayout,
  getParentId,
  groupNodes,
  layoutPropsOf,
  requireNode,
  resolveNode,
  topLevelIds,
  type Id,
  type Page,
} from '@/core'
import { unionRect } from './artboard'
import { findPage } from './commands'
import type { Item } from './align'
import type { WithCreated } from './structure'
import type { WorldRect } from './viewport'

type Estimate = ReturnType<typeof estimateLayout>
export type AutoLayoutPlan = {
  ids: Id[] // 視覚順(flex の並び順になる)
  est: Estimate
  abs: { left: number; top: number } | undefined // 元が絶対配置なら、グループを置く位置
}
export type PlanFailure = 'ineligible' | 'no-estimate'

// 見た目の順(row: 左→右 / column: 上→下 / grid: 行→左→右)
export function visualOrder(items: Item[], dir: 'row' | 'column' | 'grid'): Id[] {
  const cx = (r: WorldRect) => r.x + r.width / 2
  const cy = (r: WorldRect) => r.y + r.height / 2
  return [...items]
    .sort((a, b) => {
      if (dir === 'row') return cx(a.rect) - cx(b.rect) || cy(a.rect) - cy(b.rect)
      if (dir === 'column') return cy(a.rect) - cy(b.rect) || cx(a.rect) - cx(b.rect)
      const tol = Math.min(a.rect.height, b.rect.height) / 2
      return Math.abs(cy(a.rect) - cy(b.rect)) > tol
        ? cy(a.rect) - cy(b.rect)
        : cx(a.rect) - cx(b.rect)
    })
    .map((i) => i.id)
}

// 同じ親の兄弟を 2 つ以上選び、行/列/グリッドと推定できるときだけ計画を返す
export function planAutoLayout(
  page: Page,
  deviceId: Id,
  ids: readonly Id[],
  rectOf: (id: Id) => WorldRect | undefined,
): AutoLayoutPlan | PlanFailure {
  const top = topLevelIds(page, ids)
  if (top.length < 2) return 'ineligible'
  const parentId = getParentId(page, top[0]!)
  if (!parentId || top.some((id) => getParentId(page, id) !== parentId || page.nodes[id]?.locked)) {
    return 'ineligible'
  }
  const items: Item[] = []
  for (const id of top) {
    const rect = rectOf(id)
    if (!rect) return 'ineligible'
    items.push({ id, rect })
  }
  const union = unionRect(items.map((i) => i.rect))
  if (!union) return 'ineligible'
  const est = estimateLayout(
    union,
    items.map((i) => i.rect),
  )
  if ((est.mode !== 'flex' && est.mode !== 'grid') || est.confidence < 0.6) return 'no-estimate'
  const dir = est.mode === 'grid' ? 'grid' : (est.direction ?? 'row')
  const first = resolveNode(page, deviceId, top[0]!)
  const pos = String(first?.props.position.position ?? '')
  let abs: AutoLayoutPlan['abs']
  if (pos === 'absolute' || pos === 'fixed') {
    const pr = rectOf(parentId)
    abs = { left: union.x - (pr?.x ?? 0), top: union.y - (pr?.y ?? 0) }
  }
  return { ids: visualOrder(items, dir), est, abs }
}

const POSITION_KEYS = ['position', 'left', 'top', 'right', 'bottom']
const px = (n: number) => `${Math.round(n)}px`

// グループ化 + flex/grid 適用 + 子の絶対配置/margin 解除を 1 Command で行う
export function createAutoLayoutCommand(pageId: Id, plan: AutoLayoutPlan): WithCreated {
  const created: Id[] = []
  return {
    created,
    command: {
      name: 'auto-layout',
      apply: (d) => {
        const page = findPage(allPages(d), pageId)
        const gid = groupNodes(page, plan.ids)
        created.length = 0
        created.push(gid)
        const g = requireNode(page, gid)
        g.name = 'Auto Layout'
        g.children = [...plan.ids]
        g.props.layout = { ...g.props.layout, ...layoutPropsOf(plan.est) }
        if (plan.abs) {
          g.props.position = {
            ...g.props.position,
            position: 'absolute',
            left: px(plan.abs.left),
            top: px(plan.abs.top),
          }
        }
        for (const id of plan.ids) {
          const c = requireNode(page, id)
          for (const k of POSITION_KEYS) delete c.props.position[k]
          for (const k of Object.keys(c.props.layout)) {
            if (/^margin/.test(k)) c.props.layout[k] = '0px'
          }
        }
      },
    },
  }
}
