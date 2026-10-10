import { newId, type Asset, type ImportInput, type ImportResult } from '@/core'
import { logger } from '@/shared'
import { sha256Hex } from './hash'
import type { FetchFn } from './input'

export type ResourceFile = { name: string; mime?: string; data: ArrayBuffer }
export type ResolveOptions = {
  baseUrl?: string // 相対 URL の基準(URL 取り込み時の元 URL)
  files?: ResourceFile[] // 一緒にドロップされたファイル
  fetchFn?: FetchFn
  allowNetwork?: boolean // 既定 true
  maxBytes?: number // 1 リソースの上限。既定 10MB
  concurrency?: number // 既定 6
  signal?: AbortSignal
}
export type AssetData = { mime: string; data: ArrayBuffer }
// バイナリは assetData に分けて返す(保存は Phase 7)
export type ResolveOutput = { result: ImportResult; assetData: Map<string, AssetData> }

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
const URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
}
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'audio/mpeg': 'mp3',
  ...Object.fromEntries(
    Object.entries(MIME_BY_EXT)
      .filter(([e]) => e !== 'jpg' && e !== 'jpeg')
      .map(([e, m]) => [m, e]),
  ),
}

const mimeFromName = (name: string): string => {
  const ext = /\.([a-z0-9]+)$/i.exec(name.split(/[?#]/)[0])?.[1]?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

function kindOf(mime: string): Asset['kind'] {
  if (mime === 'image/svg+xml') return 'svg'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('font/') || /^application\/(x-)?font/.test(mime)) return 'font'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'other'
}

type Loaded = { mime: string; data: ArrayBuffer }

function decodeDataUri(uri: string): Loaded | null {
  const m = /^data:([^,;]*)((?:;[^,;]*)*),([\s\S]*)$/i.exec(uri)
  if (!m) return null
  const mime = (m[1] || 'text/plain').toLowerCase()
  try {
    const bytes = /;base64/i.test(m[2])
      ? Uint8Array.from(atob(m[3].replace(/\s/g, '')), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(m[3]))
    return { mime, data: bytes.slice().buffer as ArrayBuffer }
  } catch {
    return null
  }
}

function findFile(ref: string, files: ResourceFile[] | undefined): ResourceFile | undefined {
  if (!files || files.length === 0) return undefined
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '')
  let path = ref.split(/[?#]/)[0].replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '')
  try {
    path = decodeURIComponent(path)
  } catch {
    // そのまま使う
  }
  path = norm(path)
  const exact = files.find((f) => norm(f.name) === path)
  if (exact) return exact
  const suffix = files.find(
    (f) => path.endsWith(`/${norm(f.name)}`) || norm(f.name).endsWith(`/${path}`),
  )
  if (suffix) return suffix
  const base = path.split('/').pop()
  const same = files.filter((f) => norm(f.name).split('/').pop() === base)
  return same.length === 1 ? same[0] : undefined
}

async function load(ref: string, o: ResolveOptions): Promise<Loaded | null> {
  o.signal?.throwIfAborted()
  if (/^data:/i.test(ref)) return decodeDataUri(ref)
  const file = findFile(ref, o.files)
  if (file) return { mime: file.mime || mimeFromName(file.name), data: file.data }
  if (o.allowNetwork === false) return null
  let url: URL
  try {
    url = new URL(ref.startsWith('//') ? `https:${ref}` : ref, o.baseUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  const fetchFn: FetchFn = o.fetchFn ?? fetch
  try {
    const res = await fetchFn(url.href, o.signal ? { signal: o.signal } : {})
    if (!res.ok) return null
    const ct = res.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
    return { mime: ct || mimeFromName(url.pathname), data: await res.arrayBuffer() }
  } catch (err) {
    if (o.signal?.aborted) throw err
    return null
  }
}

function assetName(ref: string, mime: string, hash: string): string {
  const ext = EXT_BY_MIME[mime] ? `.${EXT_BY_MIME[mime]}` : ''
  if (/^data:/i.test(ref)) return `inline-${hash.slice(0, 8)}${ext}`
  const seg = ref.split(/[?#]/)[0].split('/').filter(Boolean).pop()
  if (!seg) return `resource-${hash.slice(0, 8)}${ext}`
  try {
    return decodeURIComponent(seg)
  } catch {
    return seg
  }
}

function refFromCssUrl(v: string): string | undefined {
  if (v.startsWith('ua-ext:')) {
    try {
      return decodeURIComponent(v.slice('ua-ext:'.length))
    } catch {
      return undefined
    }
  }
  return /^data:/i.test(v) ? v : undefined
}

async function pool<T>(items: T[], limit: number, fn: (x: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export async function resolveResources(
  input: ImportResult,
  options: ResolveOptions = {},
): Promise<ResolveOutput> {
  const assetData = new Map<string, AssetData>()
  return logger.runTask('resources: resolve', async () => {
    // 1. 参照を集める
    const refs = new Set<string>()
    for (const n of input.nodes) {
      const src = n.props.content.src
      if (typeof src === 'string' && src && !src.startsWith('asset:')) refs.add(src)
      const bg = n.props.appearance.backgroundImage
      if (typeof bg === 'string') {
        for (const m of bg.matchAll(URL_RE)) {
          const r = refFromCssUrl(m[1] ?? m[2] ?? m[3] ?? '')
          if (r) refs.add(r)
        }
      }
    }
    if (refs.size === 0) return { result: input, assetData }

    // 2. 解決(hash で重複排除)
    const max = options.maxBytes ?? DEFAULT_MAX_BYTES
    const byHash = new Map<string, string>()
    const refToId = new Map<string, string>()
    const assets: Asset[] = []
    const failed: string[] = []
    await pool([...refs], options.concurrency ?? 6, async (ref) => {
      const loaded = await load(ref, options)
      if (!loaded || loaded.data.byteLength > max) {
        failed.push(ref)
        return
      }
      const hash = await sha256Hex(loaded.data)
      let id = byHash.get(hash)
      if (!id) {
        id = newId()
        byHash.set(hash, id)
        assets.push({
          id,
          kind: kindOf(loaded.mime),
          name: assetName(ref, loaded.mime, hash),
          mime: loaded.mime,
          hash,
          size: loaded.data.byteLength,
          source: /^data:/i.test(ref) ? 'data-uri' : ref,
        })
        assetData.set(id, loaded)
      }
      refToId.set(ref, id)
    })

    // 3. ノードへ反映(入力は変更しない)
    const nodes = structuredClone(input.nodes)
    for (const n of nodes) {
      const unresolved: string[] = []
      const src = n.props.content.src
      if (typeof src === 'string' && src && !src.startsWith('asset:')) {
        const id = refToId.get(src)
        if (id) n.props.content.src = `asset:${id}`
        else unresolved.push(src)
      }
      const bg = n.props.appearance.backgroundImage
      if (typeof bg === 'string') {
        n.props.appearance.backgroundImage = bg.replace(
          URL_RE,
          (m: string, a: string | undefined, b: string | undefined, c: string | undefined) => {
            const r = refFromCssUrl(a ?? b ?? c ?? '')
            if (!r) return m
            const id = refToId.get(r)
            if (id) return `url("asset:${id}")`
            unresolved.push(r)
            return m
          },
        )
      }
      if (unresolved.length > 0) {
        const prev = n.props.custom.unresolvedRefs
        n.props.custom.unresolvedRefs = [...(Array.isArray(prev) ? prev : []), ...unresolved]
      }
    }

    const warnings = [...input.warnings]
    if (failed.length > 0) {
      failed.sort()
      warnings.push(
        `外部リソース ${failed.length} 件を取得できず、元の参照のまま残しました(例: ${failed[0].slice(0, 80)})`,
      )
    }
    return {
      result: { ...input, nodes, assets: [...input.assets, ...assets], warnings },
      assetData,
    }
  })
}

// ドロップされた複数ファイルから、参照解決用のファイル一覧を作る
export function filesFromInputs(inputs: ImportInput[]): ResourceFile[] {
  return inputs.flatMap((i) =>
    i.kind === 'file' && i.name && i.data
      ? [{ name: i.name, data: i.data, ...(i.mime ? { mime: i.mime } : {}) }]
      : [],
  )
}
