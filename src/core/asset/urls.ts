import type { AssetBlob } from '../persist'
import { assetRefOf } from './usage'

// asset:<id> を描画用の Blob URL に解決するストア。
// version は変更のたびに増え、React の useSyncExternalStore のスナップショットに使う。
export type AssetUrlStore = {
  get(id: string): string | undefined
  set(id: string, blob: AssetBlob): void
  load(
    id: string,
    source: { get(id: string): Promise<AssetBlob | undefined> },
  ): Promise<string | undefined>
  loadMany(
    ids: Iterable<string>,
    source: { get(id: string): Promise<AssetBlob | undefined> },
  ): Promise<void>
  revoke(id: string): void
  clear(): void
  subscribe(listener: () => void): () => void
  version(): number
}

export type AssetUrlOptions = {
  createUrl?: (blob: AssetBlob) => string
  revokeUrl?: (url: string) => void
}

export function createAssetUrlStore(options: AssetUrlOptions = {}): AssetUrlStore {
  const createUrl =
    options.createUrl ??
    ((b: AssetBlob) => URL.createObjectURL(new Blob([b.data], { type: b.mime })))
  const revokeUrl = options.revokeUrl ?? ((u: string) => URL.revokeObjectURL(u))
  const urls = new Map<string, string>()
  const pending = new Map<string, Promise<string | undefined>>()
  const listeners = new Set<() => void>()
  let ver = 0
  const bump = () => {
    ver++
    for (const l of [...listeners]) l()
  }

  const store: AssetUrlStore = {
    get: (id) => urls.get(id),
    set(id, blob) {
      const old = urls.get(id)
      if (old) revokeUrl(old)
      urls.set(id, createUrl(blob))
      bump()
    },
    load(id, source) {
      const have = urls.get(id)
      if (have) return Promise.resolve(have)
      const inflight = pending.get(id)
      if (inflight) return inflight
      const p = source
        .get(id)
        .then((blob) => {
          if (!blob) return undefined
          if (!urls.has(id)) store.set(id, blob)
          return urls.get(id)
        })
        .finally(() => pending.delete(id))
      pending.set(id, p)
      return p
    },
    async loadMany(ids, source) {
      await Promise.all([...new Set(ids)].map((id) => store.load(id, source)))
    },
    revoke(id) {
      const u = urls.get(id)
      if (!u) return
      revokeUrl(u)
      urls.delete(id)
      bump()
    },
    clear() {
      if (urls.size === 0) return
      for (const u of urls.values()) revokeUrl(u)
      urls.clear()
      bump()
    },
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    version: () => ver,
  }
  return store
}

// 描画用の src を決める。data: はそのまま、asset:<id> は解決済みなら Blob URL。それ以外は undefined
export function resolveAssetSrc(
  src: unknown,
  urls: { get(id: string): string | undefined },
): string | undefined {
  if (typeof src !== 'string') return undefined
  if (src.startsWith('data:')) return src
  const id = assetRefOf(src)
  return id ? urls.get(id) : undefined
}

// ドキュメント内の asset 参照 id(読み込み対象の列挙用)
export function assetIdsInUse(refs: Iterable<{ assetId: string }>): string[] {
  return [...new Set([...refs].map((r) => r.assetId))]
}
