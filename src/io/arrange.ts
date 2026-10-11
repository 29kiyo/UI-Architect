import { arrangeNodes, type ImportResult } from '@/core'
import { logger } from '@/shared'

// 取り込み結果に自動分類・レイアウト推定・はみ出し補正をかける(実行ログに task を記録)
export function arrangeResult(
  result: ImportResult,
  options: { deviceWidth?: number } = {},
): Promise<ImportResult> {
  return logger.runTask('arrange: classify & layout', async () => {
    const r = await arrangeNodes(result.nodes, options)
    return { ...result, nodes: r.nodes, warnings: [...result.warnings, ...r.warnings] }
  })
}
