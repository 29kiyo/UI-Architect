import { AssetSchema, NodeSchema, type Command, type ImportResult, type Node } from '@/core'

export type CommitOptions = {
  pageId?: string // 既定: 最初のページ
  parentId?: string // 既定: ページのルートノード
  index?: number // 親の children での挿入位置。既定: 末尾
  deviceId?: string // 取り込み対象デバイス(root.props.custom.sourceDeviceId に記録)
  name?: string // 履歴名の表示用。既定: ルートノード名
}

const ASSET_REF = /asset:([^"')\s]+)/g

// 規約: nodes[0] がルート。木として整合しているか検証する(不正なら throw)
export function validateImportResult(result: ImportResult): void {
  const { nodes } = result
  if (nodes.length === 0) throw new Error('取り込み結果が空です')
  const byId = new Map<string, Node>()
  for (const n of nodes) {
    NodeSchema.parse(n)
    if (byId.has(n.id)) throw new Error(`ノード ID が重複しています: ${n.id}`)
    byId.set(n.id, n)
  }
  const seen = new Set<string>()
  const stack = [nodes[0].id]
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (seen.has(id)) throw new Error(`ノードが複数の親から参照されています: ${id}`)
    seen.add(id)
    const n = byId.get(id)
    if (!n) throw new Error(`参照先のノードがありません: ${id}`)
    stack.push(...n.children)
  }
  if (seen.size !== nodes.length) throw new Error('ルートから到達できないノードがあります')
  for (const a of result.assets) AssetSchema.parse(a)
}

function remapAssetRefs(n: Node, remap: Map<string, string>): void {
  const src = n.props.content.src
  if (typeof src === 'string' && src.startsWith('asset:')) {
    const to = remap.get(src.slice('asset:'.length))
    if (to) n.props.content.src = `asset:${to}`
  }
  const bg = n.props.appearance.backgroundImage
  if (typeof bg === 'string') {
    n.props.appearance.backgroundImage = bg.replace(ASSET_REF, (m, id: string) => {
      const to = remap.get(id)
      return to ? `asset:${to}` : m
    })
  }
}

// 取り込み確定 = 1 Command(history.execute 1回 / Undo 1回で全取り消し)
export function createImportCommand(result: ImportResult, options: CommitOptions = {}): Command {
  validateImportResult(result)
  const label = options.name ?? result.nodes[0].name
  return {
    name: `import: ${label}`,
    apply(draft) {
      const page = options.pageId
        ? draft.pages.find((p) => p.id === options.pageId)
        : draft.pages[0]
      if (!page) throw new Error('取り込み先のページが見つかりません')
      const parent = page.nodes[options.parentId ?? page.rootNodeId]
      if (!parent) throw new Error(`親ノードが見つかりません: ${options.parentId}`)

      // immer の freeze が Importer の結果に及ばないよう複製して使う
      const nodes = structuredClone(result.nodes)
      for (const n of nodes) {
        if (page.nodes[n.id]) throw new Error(`node already exists: ${n.id}`)
      }

      // Asset: 同じ hash が既にあればそちらへ寄せる
      const known = new Map(draft.assets.map((a) => [a.hash, a.id]))
      const remap = new Map<string, string>()
      for (const a of result.assets) {
        const existing = known.get(a.hash)
        if (existing) {
          if (existing !== a.id) remap.set(a.id, existing)
          continue
        }
        draft.assets.push(AssetSchema.parse(a))
        known.set(a.hash, a.id)
      }

      const root = nodes[0]
      if (options.deviceId) root.props.custom.sourceDeviceId = options.deviceId
      for (const n of nodes) {
        if (remap.size > 0) remapAssetRefs(n, remap)
        page.nodes[n.id] = n
      }

      const len = parent.children.length
      const at = options.index === undefined ? len : Math.max(0, Math.min(options.index, len))
      parent.children.splice(at, 0, root.id)
    },
  }
}
