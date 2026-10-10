import type { Command } from '../history'
import type { Node } from '../model'
import { isKnownCategory } from './categories'
import { extractFeatures } from './features'
import { ruleRegistry } from './rules'

export type Classification = {
  category: string
  confidence: number // 0〜1
  needsReview: boolean
  ruleId: string
  runnerUp?: { category: string; score: number }
}
export type ClassifyOptions = {
  reviewThreshold?: number // これ未満は要確認(既定 0.5)
  marginThreshold?: number // 2位との差がこれ未満なら要確認(既定 0.08)
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function classifyNode(
  node: Node,
  getChild: (id: string) => Node | undefined,
  options: ClassifyOptions = {},
): Classification {
  const reviewThreshold = options.reviewThreshold ?? 0.5
  const marginThreshold = options.marginThreshold ?? 0.08
  const f = extractFeatures(node, getChild)

  const best = new Map<string, { score: number; ruleId: string }>()
  for (const rule of ruleRegistry.list()) {
    if (!isKnownCategory(rule.category)) continue
    let s: number
    try {
      s = rule.score(f)
    } catch {
      s = 0
    }
    if (!(s > 0)) continue
    const cur = best.get(rule.category)
    if (!cur || s > cur.score) best.set(rule.category, { score: Math.min(1, s), ruleId: rule.id })
  }

  const ranked = [...best.entries()].sort((a, b) => b[1].score - a[1].score)
  const top = ranked[0]
  if (!top) return { category: 'container', confidence: 0, needsReview: true, ruleId: 'none' }
  const second = ranked[1]
  const needsReview =
    top[1].score < reviewThreshold ||
    (second !== undefined && top[1].score - second[1].score < marginThreshold)
  return {
    category: top[0],
    confidence: round2(top[1].score),
    needsReview,
    ruleId: top[1].ruleId,
    ...(second ? { runnerUp: { category: second[0], score: round2(second[1].score) } } : {}),
  }
}

// 取り込み結果(nodes[0] がルート)を分類した新しい配列を返す。入力は変更しない。
// ルートと、固定フラグ(custom.categoryPinned)付きのノードは変更しない
export function classifyNodes(nodes: Node[], options: ClassifyOptions = {}): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const getChild = (id: string) => byId.get(id)
  return nodes.map((n, i) => {
    if (i === 0 || n.props.custom.categoryPinned === true) return n
    const c = classifyNode(n, getChild, options)
    return {
      ...n,
      category: c.category,
      props: {
        ...n.props,
        custom: {
          ...n.props.custom,
          categoryConfidence: c.confidence,
          categoryReview: c.needsReview,
          categoryRule: c.ruleId,
        },
      },
    }
  })
}

// 手動変更。ルールより優先(固定フラグを立て、以後の再分類で上書きしない)
export function createSetCategoryCommand(
  pageId: string,
  nodeId: string,
  category: string,
): Command {
  return {
    name: `category: ${category}`,
    apply(draft) {
      if (!isKnownCategory(category)) throw new Error(`未知のカテゴリです: ${category}`)
      const node = draft.pages.find((p) => p.id === pageId)?.nodes[nodeId]
      if (!node) throw new Error(`ノードが見つかりません: ${nodeId}`)
      node.category = category
      node.props.custom.categoryPinned = true
      node.props.custom.categoryReview = false
    },
  }
}
