import type { Node } from '../model'
import { isKnownCategory } from './categories'
import type { Classification } from './engine'

// AI 補助フック(接続は Phase 11)。要確認のノードにだけ呼ばれる
export type AiClassification = { category: string; confidence: number }
export type ClassifyContext = {
  parentCategory: string | undefined
  siblingCategories: string[]
  rule: Classification // ルールの結果
}
export type ClassifyHook = {
  id: string
  classify(node: Node, context: ClassifyContext): Promise<AiClassification | undefined>
}
export type MergedClassification = Classification & { source: 'rule' | 'ai' | 'both' }

let current: ClassifyHook | undefined
export const setClassifyHook = (h: ClassifyHook | undefined) => {
  current = h
}
export const getClassifyHook = () => current

// 統合方針(手動固定は呼び出し側で除外済み):
// 1. AI 無し/未知カテゴリ → ルール
// 2. 一致 → confidence の高い方、要確認を外す
// 3. ルールが十分確信(0.85 以上・要確認なし) → ルール
// 4. AI がルールより 0.1 以上高い → AI(0.7 未満なら要確認のまま)
// 5. それ以外 → ルールのまま要確認
export function mergeClassification(
  rule: Classification,
  ai: AiClassification | undefined,
): MergedClassification {
  if (!ai || !isKnownCategory(ai.category) || !(ai.confidence >= 0)) {
    return { ...rule, source: 'rule' }
  }
  if (ai.category === rule.category) {
    return {
      ...rule,
      confidence: Math.max(rule.confidence, Math.min(1, ai.confidence)),
      needsReview: false,
      source: 'both',
    }
  }
  if (!rule.needsReview && rule.confidence >= 0.85) return { ...rule, source: 'rule' }
  if (ai.confidence > rule.confidence + 0.1) {
    const c = Math.min(1, ai.confidence)
    return {
      category: ai.category,
      confidence: c,
      needsReview: c < 0.7,
      ruleId: 'ai',
      source: 'ai',
    }
  }
  return { ...rule, needsReview: true, source: 'rule' }
}
