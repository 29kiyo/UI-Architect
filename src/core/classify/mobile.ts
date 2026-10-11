import { getOverride, resolveNode, setOverrideProp } from '../device'
import type { Command } from '../history'
import {
  PROP_GROUP_KEYS,
  type Id,
  type Node,
  type Page,
  type PropGroup,
  type Props,
  type UIDocument,
} from '../model'
import { px } from './features'

// PC → スマホの自動生成。結果は overrides だけ(共有ノード木は変更しない)
export type MobileOp = {
  nodeId: Id
  group: keyof Props
  key: string
  value: PropGroup[string]
  reason: string
}
export type MobilePlanOptions = { deviceWidth: number }

const FLEX = new Set(['flex', 'inline-flex'])
const GRID = new Set(['grid', 'inline-grid'])
const KEEP_WIDTH = new Set(['icon', 'toggle', 'input-checkbox', 'input-radio', 'divider'])
const SPACING = [
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'rowGap',
  'columnGap',
] as const
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const scaled = (v: number, f: number) => `${Math.round(v * f)}px`

export function planMobile(page: Page, deviceId: Id, options: MobilePlanOptions): MobileOp[] {
  const W = options.deviceWidth
  const ops: MobileOp[] = []
  const done = new Set<string>()

  const walk = (id: Id, parentStacked: boolean) => {
    if (!page.nodes[id]) return
    const ov = getOverride(page, deviceId, id)
    const n = resolveNode(page, deviceId, id) as Node
    if (n.hidden) return
    const own = ov?.detached !== true
    const set = (group: keyof Props, key: string, value: PropGroup[string], reason: string) => {
      const tag = `${id}:${group}:${key}`
      if (!own || done.has(tag)) return
      if (ov?.propsDiff[group]?.[key] !== undefined) return // そのデバイスで設定済みは尊重
      if (n.props[group][key] === value) return
      done.add(tag)
      ops.push({ nodeId: id, group, key, value, reason })
    }

    const kids = n.children
      .map((c) => resolveNode(page, deviceId, c))
      .filter((k): k is Node => k !== undefined && !k.hidden)
    const display = str(n.props.layout.display)
    const dir = str(n.props.layout.flexDirection)
    const row = FLEX.has(display) && (dir === '' || dir.startsWith('row')) && kids.length >= 2
    const grid = GRID.has(display)
    const stacked = row || grid

    if (row) {
      set('layout', 'flexDirection', 'column', 'row→column')
      const g = px(n.props.layout.columnGap)
      if (g !== undefined) {
        set('layout', 'rowGap', scaled(g, g > 16 ? 0.75 : 1), 'gap')
        set('layout', 'columnGap', '0px', 'gap')
      }
      if (str(n.props.layout.alignItems) !== 'center') {
        set('layout', 'alignItems', 'stretch', 'column stretch')
      }
      if (n.category === 'nav' && kids.length >= 3) {
        set('custom', 'mobileNav', 'hamburger', 'nav→hamburger 候補')
      }
    }
    if (grid && str(n.props.layout.gridTemplateColumns) !== '1fr') {
      set('layout', 'gridTemplateColumns', '1fr', 'grid→1列')
    }
    if (n.category === 'sidebar') set('custom', 'mobileCandidate', 'hide', '非表示候補')

    const w = px(n.props.size.width)
    if (
      w !== undefined &&
      (w > W - 16 || (parentStacked && w >= 100 && !KEEP_WIDTH.has(n.category)))
    ) {
      set('size', 'width', '100%', '固定幅→100%')
      set('size', 'maxWidth', '100%', '固定幅→100%')
    }
    const fs = px(n.props.typography.fontSize)
    if (fs !== undefined && fs >= 24) {
      set('typography', 'fontSize', scaled(fs, fs >= 40 ? 0.6 : 0.75), '文字縮小')
    }
    for (const k of SPACING) {
      const v = px(n.props.layout[k])
      if (v !== undefined && v > 16) set('layout', k, scaled(v, 0.75), '余白縮小')
    }

    for (const c of n.children) walk(c, stacked)
  }
  walk(page.rootNodeId, false)
  return ops
}

export function createMobileCommand(pageId: Id, deviceId: Id, ops: MobileOp[]): Command {
  return {
    name: 'mobile: auto layout',
    apply(draft) {
      if (!draft.devices.some((d) => d.id === deviceId))
        throw new Error(`デバイスが見つかりません: ${deviceId}`)
      const page = draft.pages.find((p) => p.id === pageId)
      if (!page) throw new Error(`ページが見つかりません: ${pageId}`)
      for (const op of ops) setOverrideProp(page, deviceId, op.nodeId, op.group, op.key, op.value)
    },
  }
}

export function createMobileCommandFor(
  doc: UIDocument,
  pageId: Id,
  deviceId: Id,
  options: Partial<MobilePlanOptions> = {},
): { command: Command; ops: MobileOp[] } {
  const page = doc.pages.find((p) => p.id === pageId)
  const device = doc.devices.find((d) => d.id === deviceId)
  if (!page) throw new Error(`ページが見つかりません: ${pageId}`)
  if (!device) throw new Error(`デバイスが見つかりません: ${deviceId}`)
  const ops = planMobile(page, deviceId, { deviceWidth: options.deviceWidth ?? device.width })
  return { command: createMobileCommand(pageId, deviceId, ops), ops }
}

// AI 補助フック(接続は Phase 11)。ルール結果の ops を受け取り、修正後の ops を返す
export type MobileAssistHook = {
  id: string
  refine(
    ops: MobileOp[],
    ctx: { page: Page; deviceId: Id; deviceWidth: number },
  ): Promise<MobileOp[]>
}
let hook: MobileAssistHook | undefined
export const setMobileAssistHook = (h: MobileAssistHook | undefined) => {
  hook = h
}

export async function planMobileAsync(
  page: Page,
  deviceId: Id,
  options: MobilePlanOptions & { hook?: MobileAssistHook },
): Promise<{ ops: MobileOp[]; warnings: string[] }> {
  const base = planMobile(page, deviceId, options)
  const h = options.hook ?? hook
  if (!h) return { ops: base, warnings: [] }
  try {
    const refined = await h.refine(base, { page, deviceId, deviceWidth: options.deviceWidth })
    const valid = refined.filter(
      (o) =>
        page.nodes[o.nodeId] && (PROP_GROUP_KEYS as string[]).includes(o.group) && o.key !== '',
    )
    const dropped = refined.length - valid.length
    return {
      ops: valid,
      warnings: dropped > 0 ? [`AI 提案のうち不正な ${dropped} 件を除外しました`] : [],
    }
  } catch {
    return { ops: base, warnings: ['AI 補助の呼び出しに失敗したためルール結果を使用しました'] }
  }
}
