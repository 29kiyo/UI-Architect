import type { Asset } from '../model'

export type AssetKind = Asset['kind']

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

// 同じ mime に複数拡張子がある場合は先に書いたものを採用(jpg)
const EXT_BY_MIME: Record<string, string> = {}
for (const [ext, mime] of Object.entries(MIME_BY_EXT)) {
  if (!(mime in EXT_BY_MIME)) EXT_BY_MIME[mime] = ext
}

const FONT_MIMES = new Set([
  'application/font-woff',
  'application/font-woff2',
  'application/x-font-ttf',
  'application/x-font-otf',
  'application/vnd.ms-opentype',
])

const OCTET = 'application/octet-stream'

export function mimeFromName(name: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(name.split(/[?#]/)[0])?.[1]?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? OCTET
}

// mime が空/octet-stream のときだけファイル名から補う
export function resolveMime(name: string, mime?: string): string {
  const m = (mime ?? '').split(';')[0].trim().toLowerCase()
  return m && m !== OCTET ? m : mimeFromName(name)
}

export function assetKindOfMime(mime: string): AssetKind {
  const m = mime.split(';')[0].trim().toLowerCase()
  if (m === 'image/svg+xml') return 'svg'
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('font/') || FONT_MIMES.has(m)) return 'font'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  return 'other'
}

export function extFromMime(mime: string): string | undefined {
  return EXT_BY_MIME[mime.split(';')[0].trim().toLowerCase()]
}
