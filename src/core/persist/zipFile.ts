import { logger as defaultLogger, type Logger } from '@/shared'
import type { UIDocument } from '../model'
import type { AssetBlob } from './blobs'
import { PROJECT_ZIP_EXT, exportProjectZip, loadProjectBytes, type LoadedProject } from './zip'

const safeName = (n: string) => n.replace(/[\\/:*?"<>|]/g, '_').trim() || 'project'

function download(data: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ピッカーのキャンセルは AbortError(UI 側で握り潰す)
export function saveProjectZip(
  doc: UIDocument,
  source: { get(id: string): Promise<AssetBlob | undefined> },
  opts: { logger?: Logger } = {},
): Promise<{ name: string; warnings: string[] }> {
  return (opts.logger ?? defaultLogger).runTask('save project zip', async () => {
    const fileName = safeName(doc.project.name) + PROJECT_ZIP_EXT
    const { data, warnings } = await exportProjectZip(doc, source)
    // 直接保存(showSaveFilePicker)は環境によって空ファイルになるため、ダウンロードに一本化
    download(data, fileName)
    return { name: fileName, warnings }
  })
}

async function pickFile(): Promise<File> {
  // 開くは標準のファイル選択を使う(showOpenFilePicker の getFile が拒否される環境があるため)
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip,.json,application/zip,application/json'
    input.addEventListener('change', () => {
      const f = input.files?.[0]
      if (f) resolve(f)
      else reject(new DOMException('no file selected', 'AbortError'))
    })
    input.addEventListener('cancel', () => reject(new DOMException('cancelled', 'AbortError')))
    input.click()
  })
}

// zip でも従来の JSON でも読める
export function openProjectZip(
  opts: { logger?: Logger } = {},
): Promise<LoadedProject & { name: string }> {
  return (opts.logger ?? defaultLogger).runTask('open project zip', async () => {
    const f = await pickFile()
    return { ...(await loadProjectBytes(await f.arrayBuffer())), name: f.name }
  })
}
