import type { Asset, UIDocument } from '../model'
import { assetWarnings, type AssetWarning } from './manage'
import { findAssetUsages, groupUsagesByAsset } from './usage'

export type AssetRow = {
  asset: Asset
  usageCount: number
  unused: boolean
  warnings: AssetWarning[]
}

export type AssetFilter = { query?: string; kind?: Asset['kind'] | 'all'; unusedOnly?: boolean }

// アセットパネルの行データ(検索は名前の部分一致・大文字小文字無視)
export function assetRows(doc: UIDocument, filter: AssetFilter = {}): AssetRow[] {
  const usage = groupUsagesByAsset(findAssetUsages(doc))
  const warns = new Map<string, AssetWarning[]>()
  for (const w of assetWarnings(doc)) {
    const list = warns.get(w.assetId)
    if (list) list.push(w)
    else warns.set(w.assetId, [w])
  }
  const q = (filter.query ?? '').trim().toLowerCase()
  return doc.assets
    .map((asset) => {
      const n = usage.get(asset.id)?.length ?? 0
      return { asset, usageCount: n, unused: n === 0, warnings: warns.get(asset.id) ?? [] }
    })
    .filter((r) => !q || r.asset.name.toLowerCase().includes(q))
    .filter((r) => !filter.kind || filter.kind === 'all' || r.asset.kind === filter.kind)
    .filter((r) => !filter.unusedOnly || r.unused)
}
