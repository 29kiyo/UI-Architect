import {
  categoryRegistry,
  createNode,
  getParentId,
  PropsSchema,
  type Id,
  type Node,
  type Page,
  type PropGroup,
  type Props,
} from '@/core'
import type { Point, WorldRect } from './viewport'

export const PALETTE_MIME = 'application/x-ui-architect-category'

type Groups = Partial<Record<keyof Props, PropGroup>>

const TEXT_CATEGORIES = new Set(['text-heading', 'text-body', 'label', 'link'])
const IMAGE_CATEGORIES = new Set(['image', 'icon'])
// 見た目は小さな部品で、他の部品の入れ物にはしない(ドロップ先として選ばない)
const PLAIN = new Set(['button', 'link', 'toggle', 'slider'])

const solid = { borderWidth: '1px', borderStyle: 'solid', borderColor: '#999999' }
const BOX: Groups = {
  size: { width: '160px', height: '80px' },
  border: { borderWidth: '1px', borderStyle: 'dashed', borderColor: '#999999' },
}

// 追加直後に見えるよう、カテゴリごとの最小の見た目(カテゴリ既定 props で上書き)
function baseGroups(id: string): Groups {
  switch (id) {
    case 'text-heading':
      return { typography: { fontSize: '24px', fontWeight: '700' } }
    case 'text-body':
    case 'label':
    case 'link':
      return { typography: { fontSize: '16px' } }
    case 'button':
      return {
        size: { width: '120px', height: '40px' },
        appearance: { backgroundColor: '#3b82f6' },
        typography: { color: '#ffffff', fontSize: '16px' },
        radius: { borderRadius: '6px' },
      }
    case 'input-text':
    case 'select':
      return { size: { width: '200px', height: '36px' }, border: solid }
    case 'textarea':
      return { size: { width: '200px', height: '80px' }, border: solid }
    case 'input-checkbox':
    case 'input-radio':
      return { size: { width: '24px', height: '24px' }, border: solid }
    case 'toggle':
      return {
        size: { width: '44px', height: '24px' },
        border: solid,
        radius: { borderRadius: '12px' },
      }
    case 'slider':
      return { size: { width: '160px', height: '24px' }, border: solid }
    case 'image':
      return { size: { width: '120px', height: '80px' } }
    case 'icon':
      return { size: { width: '24px', height: '24px' } }
    case 'divider':
      return { size: { width: '100%', height: '1px' }, appearance: { backgroundColor: '#cccccc' } }
    default:
      return BOX
  }
}

function mergeGroups(a: Groups, b: Groups): Groups {
  const out: Groups = { ...a }
  for (const k of Object.keys(b) as (keyof Props)[]) out[k] = { ...(a[k] ?? {}), ...(b[k] ?? {}) }
  return out
}

export function createNodeForCategory(id: string): Node | undefined {
  const def = categoryRegistry.get(id)
  if (!def) return undefined
  const groups = mergeGroups(baseGroups(id), def.defaultProps)
  if (TEXT_CATEGORIES.has(id) || id === 'button') {
    groups.content = { ...(groups.content ?? {}), text: def.label }
  }
  const type = TEXT_CATEGORIES.has(id) ? 'text' : IMAGE_CATEGORIES.has(id) ? 'image' : 'element'
  return createNode({ type, category: id, name: def.label, props: PropsSchema.parse(groups) })
}

// parent の子に childCategory を置けるか(型・カテゴリの allowedChildren で判定)
export function canContain(parent: Node, childCategory: string): boolean {
  if (parent.type === 'text' || parent.type === 'image' || parent.type === 'svg') return false
  if (parent.componentRef) return false // インスタンスの子はスロット内容
  const a = categoryRegistry.get(parent.category)?.allowedChildren ?? 'any'
  return a === 'any' || (Array.isArray(a) && a.includes(childCategory))
}

// ヒットしたノードから親方向に探し、置ける最初のコンテナ。無ければルート
export function dropParent(page: Page, hitId: Id | undefined, category: string): Id {
  let cur = hitId && page.nodes[hitId] ? hitId : undefined
  while (cur) {
    const n = page.nodes[cur]
    if (n && !PLAIN.has(n.category) && canContain(n, category)) return cur
    cur = getParentId(page, cur)
  }
  return page.rootNodeId
}

const px = (n: number) => `${Math.round(n)}px`
const isFlow = (v: unknown) => typeof v === 'string' && /^(inline-)?(flex|grid)$/.test(v)

export type PaletteDropPlan = { node: Node; parentId: Id }

// 親が配置基準(relative/absolute/fixed)で flex/grid でなければ、ドロップ位置に absolute で置く。
// それ以外(通常の流れ)は末尾に追加する
export function planPaletteDrop(
  page: Page,
  hitId: Id | undefined,
  category: string,
  world: Point,
  rectOf: (id: Id) => WorldRect | undefined,
): PaletteDropPlan | undefined {
  const node = createNodeForCategory(category)
  if (!node) return undefined
  const parentId = dropParent(page, hitId, category)
  const parent = page.nodes[parentId]
  if (!parent) return undefined
  const pos = String(parent.props.position.position ?? '')
  if (!isFlow(parent.props.layout.display) && /^(relative|absolute|fixed)$/.test(pos)) {
    const r = rectOf(parentId)
    if (r) {
      node.props.position = {
        ...node.props.position,
        position: 'absolute',
        left: px(world.x - r.x),
        top: px(world.y - r.y),
      }
    }
  }
  return { node, parentId }
}
