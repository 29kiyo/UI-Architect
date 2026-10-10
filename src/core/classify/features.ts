import type { Node, PropGroup } from '../model'

// 分類に使う特徴量(Node から抽出。DOM には依存しない)
export type ClassifyFeatures = {
  node: Node
  nodeType: string // element | text | image | svg
  tag: string
  role: string
  ariaLabel: string
  classTokens: string[]
  inputType: string
  text: string
  childCount: number
  childTags: string[]
  width: number | undefined
  height: number | undefined
  hasBackground: boolean
  hasBorder: boolean
  radius: number // 最大角丸(px)。50% 以上は 9999
  hasShadow: boolean
  cursorPointer: boolean
  hasHandlers: boolean
  fontSize: number | undefined
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export function px(v: unknown): number | undefined {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return undefined
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(v.trim())
  return m ? Number(m[1]) : undefined
}

function radiusOf(radius: PropGroup): number {
  let max = 0
  for (const v of Object.values(radius)) {
    if (typeof v !== 'string') continue
    const t = v.trim()
    if (t.endsWith('%')) {
      const p = parseFloat(t)
      max = Math.max(max, p >= 50 ? 9999 : p > 0 ? 1 : 0)
    } else {
      max = Math.max(max, px(t) ?? 0)
    }
  }
  return max
}

export const tokensOf = (cls: string): string[] =>
  cls
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

export function extractFeatures(
  node: Node,
  getChild: (id: string) => Node | undefined,
): ClassifyFeatures {
  const { custom, size, content, appearance, border, shadow, typography, radius } = node.props
  const rect = custom.sourceRect
  const r =
    rect && typeof rect === 'object' && !Array.isArray(rect)
      ? (rect as Record<string, unknown>)
      : {}
  const kids = node.children.map(getChild).filter((c): c is Node => c !== undefined)
  return {
    node,
    nodeType: node.type,
    tag: str(custom.tag).toLowerCase(),
    role: str(custom.role).toLowerCase(),
    ariaLabel: str(custom.ariaLabel),
    classTokens: tokensOf(str(custom.className)),
    inputType: str(content.inputType).toLowerCase(),
    text: str(content.text).trim(),
    childCount: node.children.length,
    childTags: kids.map((k) => str(k.props.custom.tag).toLowerCase()),
    width: px(r.width) ?? px(size.width),
    height: px(r.height) ?? px(size.height),
    hasBackground: str(appearance.backgroundColor) !== '' || str(appearance.backgroundImage) !== '',
    hasBorder: Object.keys(border).length > 0,
    radius: radiusOf(radius),
    hasShadow: str(shadow.boxShadow) !== '',
    cursorPointer: appearance.cursor === 'pointer',
    hasHandlers:
      node.events.length > 0 || (Array.isArray(custom.handlers) && custom.handlers.length > 0),
    fontSize: px(typography.fontSize),
  }
}
