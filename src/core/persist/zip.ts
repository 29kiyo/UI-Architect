import JSZip from 'jszip'
import { extFromMime } from '../asset'
import type { Asset, UIDocument } from '../model'
import type { AssetBlob } from './blobs'
import { parseProject, ProjectLoadError, serializeProject } from './format'

// プロジェクトファイル(zip): project.json + assets/<id>.<ext>
const PROJECT_JSON = 'project.json'
const ASSET_DIR = 'assets/'
export const PROJECT_ZIP_EXT = '.uiarch.zip'

export type LoadedProject = {
  doc: UIDocument
  warnings: string[]
  assetData: Map<string, AssetBlob>
}

const assetPath = (a: Asset): string => {
  const ext = extFromMime(a.mime)
  return `${ASSET_DIR}${encodeURIComponent(a.id)}${ext ? `.${ext}` : ''}`
}

export const isZipBytes = (b: Uint8Array): boolean =>
  b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b

// Blob が無い asset は書き出さず warnings に入れる(ドキュメントのメタは残る)
export async function exportProjectZip(
  doc: UIDocument,
  source: { get(id: string): Promise<AssetBlob | undefined> },
  options: { now?: number } = {},
): Promise<{ data: Uint8Array; warnings: string[] }> {
  const zip = new JSZip()
  zip.file(
    PROJECT_JSON,
    serializeProject(doc, {
      pretty: true,
      ...(options.now !== undefined ? { now: options.now } : {}),
    }),
  )
  const warnings: string[] = []
  for (const a of doc.assets) {
    const blob = await source.get(a.id)
    if (!blob) {
      warnings.push(`asset data missing: ${a.name} (${a.id})`)
      continue
    }
    // 画像・フォント等は圧縮済みが多いので無圧縮で格納
    zip.file(assetPath(a), blob.data, { compression: 'STORE' })
  }
  const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return { data, warnings }
}

export async function importProjectZip(input: ArrayBuffer | Uint8Array): Promise<LoadedProject> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(input)
  } catch {
    throw new ProjectLoadError('invalid zip')
  }
  const entry = zip.file(PROJECT_JSON)
  if (!entry) throw new ProjectLoadError('project.json not found in zip')
  const { doc, warnings } = parseProject(await entry.async('string'))

  const files = new Map<string, JSZip.JSZipObject>()
  zip.forEach((path, file) => {
    if (file.dir || !path.startsWith(ASSET_DIR)) return
    const base = path.slice(ASSET_DIR.length)
    if (base.includes('/')) return
    const dot = base.lastIndexOf('.')
    let stem = dot > 0 ? base.slice(0, dot) : base
    try {
      stem = decodeURIComponent(stem)
    } catch {
      // そのまま使う
    }
    files.set(stem, file)
  })

  const assetData = new Map<string, AssetBlob>()
  for (const a of doc.assets) {
    const f = files.get(a.id)
    if (!f) {
      warnings.push(`asset file missing in zip: ${a.name} (${a.id})`)
      continue
    }
    assetData.set(a.id, { mime: a.mime, data: await f.async('arraybuffer') })
  }
  return { doc, warnings, assetData }
}

// zip(先頭 PK)でなければ従来の JSON として読む(旧形式からの移行)
export async function loadProjectBytes(input: ArrayBuffer | Uint8Array): Promise<LoadedProject> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (isZipBytes(bytes)) return importProjectZip(bytes)
  const parsed = parseProject(new TextDecoder().decode(bytes))
  return { ...parsed, assetData: new Map() }
}
