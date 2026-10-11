import type { Node } from '../model'
import { classifyNodes, type ClassifyOptions } from './engine'
import { getClassifyHook, mergeClassification, type ClassifyHook } from './hook'
import { arrangeLayout, fixOverflow } from './layout'

export type ArrangeOptions = {
  deviceWidth?: number
  classify?: ClassifyOptions
  hook?: ClassifyHook // 省略時は setClassifyHook で登録されたもの
  layout?: boolean // 既定 true
}
export type ArrangeResult = { nodes: Node[]; warnings: string[] }

// 要確認のノードだけ AI フックに問い合わせて統合する(失敗は無視してルール結果のまま)
async function applyHook(nodes: Node[], hook: ClassifyHook, warnings: string[]): Promise<Node[]> {
  const out = [...nodes]
  const parentOf = new Map<string, number>()
  out.forEach((n, i) => n.children.forEach((c) => parentOf.set(c, i)))
  const index = new Map(out.map((n, i) => [n.id, i]))
  let failed = 0
  for (let i = 1; i < out.length; i++) {
    const n = out[i]
    if (n.props.custom.categoryPinned === true || n.props.custom.categoryReview !== true) continue
    const p = parentOf.has(n.id) ? out[parentOf.get(n.id) as number] : undefined
    const rule = {
      category: n.category,
      confidence:
        typeof n.props.custom.categoryConfidence === 'number'
          ? n.props.custom.categoryConfidence
          : 0,
      needsReview: true,
      ruleId: String(n.props.custom.categoryRule ?? 'none'),
    }
    let ai
    try {
      ai = await hook.classify(n, {
        parentCategory: p?.category,
        siblingCategories: (p?.children ?? [])
          .filter((id) => id !== n.id)
          .map((id) => out[index.get(id) as number].category),
        rule,
      })
    } catch {
      failed++
    }
    const m = mergeClassification(rule, ai)
    out[i] = {
      ...n,
      category: m.category,
      props: {
        ...n.props,
        custom: {
          ...n.props.custom,
          categoryConfidence: m.confidence,
          categoryReview: m.needsReview,
          categoryRule: m.ruleId,
          categorySource: m.source,
        },
      },
    }
  }
  if (failed > 0) warnings.push(`AI 分類の呼び出しが ${failed} 件失敗しました(ルール結果を使用)`)
  return out
}

// 分類 → (AI 補助) → レイアウト推定 → はみ出し補正。入力は変更しない
export async function arrangeNodes(
  nodes: Node[],
  options: ArrangeOptions = {},
): Promise<ArrangeResult> {
  const warnings: string[] = []
  let cur = classifyNodes(nodes, options.classify)
  const hook = options.hook ?? getClassifyHook()
  if (hook) cur = await applyHook(cur, hook, warnings)
  const review = cur.filter((n, i) => i > 0 && n.props.custom.categoryReview === true).length
  if (review > 0) warnings.push(`分類が不確かなノードが ${review} 件あります(要確認)`)
  if (options.layout !== false) {
    const l = arrangeLayout(cur)
    cur = l.nodes
    warnings.push(...l.warnings)
    if (options.deviceWidth !== undefined) {
      const f = fixOverflow(cur, options.deviceWidth)
      cur = f.nodes
      warnings.push(...f.warnings)
    }
  }
  return { nodes: cur, warnings }
}
