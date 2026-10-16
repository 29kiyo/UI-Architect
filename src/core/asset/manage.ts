import type { Command } from '../history'
import type { Asset, UIDocument } from '../model'
import { fontFamilyOf } from './font'
import { findAssetUsages, findMissingAssetRefs } from './usage'

export const LARGE_ASSET_BYTES = 2 * 1024 * 1024
export const LARGE_IMAGE_SIDE = 4096

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function replaceIn(
  value: unknown,
  re: RegExp,
  to: string,
  counter: { n: number },
  depth = 0,
): unknown {
  if (depth > 64) return value
  if (typeof value === 'string') {
    return value.replace(re, () => {
      counter.n++
      return to
    })
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++)
      value[i] = replaceIn(value[i], re, to, counter, depth + 1)
    return value
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    for (const k of Object.keys(o)) o[k] = replaceIn(o[k], re, to, counter, depth + 1)
    return o
  }
  return value
}

// asset:<fromId> を asset:<toId> に置換する(draft 向け)。置換した箇所の数を返す
export function replaceAssetRefs(doc: UIDocument, fromId: string, toId: string): number {
  if (fromId === toId) return 0
  // 後ろが id の続きにならないよう、終端(引用符・括弧・空白・文字列末尾)を確認する
  const re = new RegExp(`asset:${escapeRe(fromId)}(?![^"')\\s])`, 'g')
  const to = `asset:${toId}`
  const c = { n: 0 }
  for (const page of doc.pages) {
    for (const node of Object.values(page.nodes)) replaceIn(node.props, re, to, c)
    for (const byNode of Object.values(page.overrides ?? {})) replaceIn(byNode, re, to, c)
  }
  for (const part of [doc.components, doc.tokens, doc.variables, doc.mockData]) {
    replaceIn(part, re, to, c)
  }
  return c.n
}

// 種類が同じ Asset どうしだけ置換できる。置換元は残る(未使用になる)
export function createReplaceAssetCommand(fromId: string, toId: string): Command {
  return {
    name: 'replace-asset',
    apply: (d) => {
      const from = d.assets.find((a) => a.id === fromId)
      const to = d.assets.find((a) => a.id === toId)
      if (!from || !to) throw new Error('asset not found')
      if (from.kind !== to.kind) throw new Error('asset kind mismatch')
      replaceAssetRefs(d, fromId, toId)
    },
  }
}

// 参照が残っている Asset は削除しない(参照切れを作らない)
export function createRemoveAssetsCommand(ids: readonly string[]): Command {
  return {
    name: ids.length === 1 ? 'remove-asset' : 'remove-assets',
    apply: (d) => {
      const used = new Set(findAssetUsages(d).map((u) => u.assetId))
      const drop = new Set(ids.filter((id) => !used.has(id)))
      d.assets = d.assets.filter((a) => !drop.has(a.id))
    },
  }
}

// 削除できる(未使用の)id だけを返す。UI の確認表示用
export function removableAssetIds(doc: UIDocument, ids: readonly string[]): string[] {
  const used = new Set(findAssetUsages(doc).map((u) => u.assetId))
  return ids.filter((id) => !used.has(id) && doc.assets.some((a) => a.id === id))
}

export type AssetWarning = {
  code: 'large-size' | 'large-dimension' | 'missing-ref' | 'font-name-conflict'
  assetId: string
  message: string
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(1)

export function assetWarnings(
  doc: UIDocument,
  limits: { bytes?: number; side?: number } = {},
): AssetWarning[] {
  const maxBytes = limits.bytes ?? LARGE_ASSET_BYTES
  const maxSide = limits.side ?? LARGE_IMAGE_SIDE
  const out: AssetWarning[] = []
  for (const a of doc.assets) {
    if (a.size > maxBytes) {
      out.push({
        code: 'large-size',
        assetId: a.id,
        message: `${a.name}: ${mb(a.size)}MB(上限の目安 ${mb(maxBytes)}MB)`,
      })
    }
    if (a.kind === 'image' && Math.max(a.width ?? 0, a.height ?? 0) > maxSide) {
      out.push({
        code: 'large-dimension',
        assetId: a.id,
        message: `${a.name}: ${a.width}×${a.height}px`,
      })
    }
  }
  const seen = new Map<string, Asset>()
  for (const a of doc.assets.filter((x) => x.kind === 'font')) {
    const fam = fontFamilyOf(a)
    const first = seen.get(fam)
    if (first) {
      out.push({
        code: 'font-name-conflict',
        assetId: a.id,
        message: `${a.name}: フォント名 "${fam}" が ${first.name} と重複`,
      })
    } else seen.set(fam, a)
  }
  for (const u of findMissingAssetRefs(doc)) {
    out.push({
      code: 'missing-ref',
      assetId: u.assetId,
      message: `参照先の Asset がありません: ${u.assetId}`,
    })
  }
  return out
}
