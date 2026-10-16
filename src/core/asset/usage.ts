import type { Asset, UIDocument } from '../model'

export type AssetUsage = {
  assetId: string
  area: 'node' | 'override' | 'other'
  path: string // 参照を含む値までの props 内パス(例: content.src)
  pageId?: string
  nodeId?: string
  deviceId?: string
}

// 参照は文字列中の asset:<id>(content.src、url("asset:<id>") など)
const ASSET_REF = /asset:([^"')\s]+)/g
const ASSET_REF_EXACT = /^asset:([^"')\s]+)$/

export const toAssetRef = (id: string): string => `asset:${id}`

// 値全体が asset:<id> のときだけ id を返す
export function assetRefOf(value: unknown): string | undefined {
  return typeof value === 'string' ? ASSET_REF_EXACT.exec(value)?.[1] : undefined
}

type Hit = { id: string; path: string }

function scan(value: unknown, path: string, out: Hit[], depth = 0): void {
  if (depth > 64) return
  if (typeof value === 'string') {
    for (const m of value.matchAll(ASSET_REF)) {
      const id = m[1]
      if (id) out.push({ id, path })
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => scan(v, `${path}[${i}]`, out, depth + 1))
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) scan(v, path ? `${path}.${k}` : k, out, depth + 1)
  }
}

// ドキュメント内のすべての asset 参照(doc.assets 自体は除く)
export function findAssetUsages(doc: UIDocument): AssetUsage[] {
  const usages: AssetUsage[] = []
  const add = (hits: Hit[], base: Omit<AssetUsage, 'assetId' | 'path'>) => {
    for (const h of hits) usages.push({ assetId: h.id, path: h.path, ...base })
  }
  for (const page of doc.pages) {
    for (const [nodeId, node] of Object.entries(page.nodes)) {
      const hits: Hit[] = []
      scan(node.props, '', hits)
      add(hits, { area: 'node', pageId: page.id, nodeId })
    }
    for (const [deviceId, byNode] of Object.entries(page.overrides ?? {})) {
      for (const [nodeId, ov] of Object.entries(byNode as Record<string, unknown>)) {
        const hits: Hit[] = []
        scan(ov, '', hits)
        add(hits, { area: 'override', pageId: page.id, nodeId, deviceId })
      }
    }
  }
  // コンポーネント・トークン・変数・モックデータ
  for (const part of [doc.components, doc.tokens, doc.variables, doc.mockData]) {
    const hits: Hit[] = []
    scan(part, '', hits)
    add(hits, { area: 'other' })
  }
  return usages
}

export function groupUsagesByAsset(usages: readonly AssetUsage[]): Map<string, AssetUsage[]> {
  const map = new Map<string, AssetUsage[]>()
  for (const u of usages) {
    const list = map.get(u.assetId)
    if (list) list.push(u)
    else map.set(u.assetId, [u])
  }
  return map
}

export function findUnusedAssets(doc: UIDocument): Asset[] {
  const used = groupUsagesByAsset(findAssetUsages(doc))
  return doc.assets.filter((a) => !used.has(a.id))
}

// doc.assets に存在しない asset を参照している箇所(参照切れ)
export function findMissingAssetRefs(doc: UIDocument): AssetUsage[] {
  const ids = new Set(doc.assets.map((a) => a.id))
  return findAssetUsages(doc).filter((u) => !ids.has(u.assetId))
}
