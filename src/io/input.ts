import type { ImportInput } from '@/core'
import { logger } from '@/shared'

export type ImportInputErrorCode = 'invalid-url' | 'fetch-failed' | 'http-error' | 'too-large'

export class ImportInputError extends Error {
  readonly code: ImportInputErrorCode
  constructor(code: ImportInputErrorCode, message: string) {
    super(message)
    this.name = 'ImportInputError'
    this.code = code
  }
}

const TEXT_EXTS = new Set([
  'html',
  'htm',
  'css',
  'svg',
  'xml',
  'json',
  'txt',
  'md',
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'vue',
  'svelte',
  'dart',
  'swift',
  'kt',
  'xaml',
  'qml',
])
const TEXT_MIMES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'image/svg+xml',
])

function extOf(name?: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name ?? '')
  return m ? m[1].toLowerCase() : ''
}

export function isTextLike(name?: string, mime?: string): boolean {
  const base = (mime ?? '').split(';')[0].trim().toLowerCase()
  if (base.startsWith('text/') || TEXT_MIMES.has(base)) return true
  return TEXT_EXTS.has(extOf(name))
}

function makeInput(
  kind: ImportInput['kind'],
  buf: ArrayBuffer,
  extra: { name?: string; mime?: string; url?: string },
): ImportInput {
  const text = isTextLike(extra.name, extra.mime) ? new TextDecoder('utf-8').decode(buf) : undefined
  return {
    kind,
    data: buf,
    ...(extra.name ? { name: extra.name } : {}),
    ...(extra.mime ? { mime: extra.mime } : {}),
    ...(extra.url ? { url: extra.url } : {}),
    ...(text !== undefined ? { text } : {}),
  }
}

// 貼付
export function fromText(text: string, name?: string): ImportInput {
  return { kind: 'text', text, ...(name ? { name } : {}) }
}

// ファイル(ドラッグ&ドロップ/選択)
export async function fromFile(file: File): Promise<ImportInput> {
  return makeInput('file', await file.arrayBuffer(), {
    name: file.name,
    ...(file.type ? { mime: file.type } : {}),
  })
}

export function fromFiles(files: Iterable<File>): Promise<ImportInput[]> {
  return Promise.all([...files].map(fromFile))
}

// URL(取得できるのは CORS 等が許す場合のみ。失敗時は貼付/ファイルへ案内)
export type FetchFn = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>
export type FromUrlOptions = { signal?: AbortSignal; fetchFn?: FetchFn; maxBytes?: number }

const FALLBACK_HINT = '内容を貼付またはファイルで取り込んでください。'

function lastSegment(u: URL): string {
  const seg = u.pathname.split('/').filter(Boolean).pop() ?? ''
  try {
    return decodeURIComponent(seg) || u.hostname
  } catch {
    return seg || u.hostname
  }
}

export async function fromUrl(url: string, options: FromUrlOptions = {}): Promise<ImportInput> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ImportInputError('invalid-url', `URLの形式が正しくありません: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ImportInputError('invalid-url', 'http/https のURLのみ対応しています')
  }
  const fetchFn: FetchFn = options.fetchFn ?? fetch
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024

  return logger.runTask(`fetch: ${parsed.href}`, async () => {
    let res: Response
    try {
      res = await fetchFn(parsed.href, options.signal ? { signal: options.signal } : {})
    } catch (err) {
      if (options.signal?.aborted) throw err
      throw new ImportInputError(
        'fetch-failed',
        `URLを取得できませんでした(CORS制限などの可能性)。${FALLBACK_HINT}`,
      )
    }
    if (!res.ok) {
      throw new ImportInputError(
        'http-error',
        `取得に失敗しました(HTTP ${res.status})。${FALLBACK_HINT}`,
      )
    }
    const buf = await res.arrayBuffer()
    if (buf.byteLength > maxBytes) {
      throw new ImportInputError('too-large', `サイズが上限(${maxBytes} bytes)を超えています`)
    }
    const mime = res.headers.get('content-type') ?? undefined
    return makeInput('url', buf, {
      name: lastSegment(parsed),
      url: parsed.href,
      ...(mime ? { mime } : {}),
    })
  })
}
