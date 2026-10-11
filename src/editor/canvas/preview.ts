import type { Node, Page } from '@/core'

export const PREVIEW_DEVICE_ID = 'preview'

// 取り込み結果(nodes[0] がルート)から、描画用の一時 Page を組む(ドキュメントには入れない)
export function previewPage(nodes: Node[]): Page | undefined {
  const root = nodes[0]
  if (!root) return undefined
  return {
    id: 'preview',
    name: 'preview',
    route: '/',
    rootNodeId: root.id,
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    overrides: {},
  }
}
