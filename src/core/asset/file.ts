import { newId, type Asset } from '../model'
import type { AssetBlob } from '../persist'
import { assetKindOfMime, resolveMime } from './kind'

export type AssetFile = { name: string; mime?: string; data: ArrayBuffer }
export type NewAsset = { asset: Asset; blob: AssetBlob }

export async function sha256HexOf(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// ファイル → Asset + バイナリ。画像サイズは DOM が要るので呼び出し側から渡す
export async function buildAsset(
  file: AssetFile,
  dims?: { width: number; height: number },
): Promise<NewAsset> {
  const mime = resolveMime(file.name, file.mime)
  const asset: Asset = {
    id: newId(),
    kind: assetKindOfMime(mime),
    name: file.name,
    mime,
    hash: await sha256HexOf(file.data),
    size: file.data.byteLength,
    source: 'file',
    ...(dims ? { width: dims.width, height: dims.height } : {}),
  }
  return { asset, blob: { mime, data: file.data } }
}
