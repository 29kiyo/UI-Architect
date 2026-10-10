import { logger as defaultLogger, type Logger } from '@/shared'
import type { UIDocument } from '../model'
import { parseProject, serializeProject, type ParsedProject } from './format'

type WritableLike = { write(data: string): Promise<void>; close(): Promise<void> }
export type FileHandleLike = {
  name: string
  createWritable(): Promise<WritableLike>
  getFile(): Promise<File>
}
type FsaGlobal = {
  showSaveFilePicker?: (o: unknown) => Promise<FileHandleLike>
  showOpenFilePicker?: (o: unknown) => Promise<FileHandleLike[]>
}

const fsa = () => globalThis as unknown as FsaGlobal
const PICKER_TYPES = [
  { description: 'UI-Architect project', accept: { 'application/json': ['.json'] } },
]

export const PROJECT_FILE_EXT = '.uiarch.json'

// File System Access API が使えるか(使えなければダウンロード / アップロードにフォールバック)
export function hasFileSystemAccess(): boolean {
  return (
    typeof fsa().showSaveFilePicker === 'function' && typeof fsa().showOpenFilePicker === 'function'
  )
}

const safeName = (n: string) => n.replace(/[\\/:*?"<>|]/g, '_').trim() || 'project'

function download(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type SaveResult = { name: string; handle?: FileHandleLike }

// handle を渡すと上書き保存。saveAs: true で毎回ピッカーを出す。ピッカーのキャンセルは AbortError。
export function saveProjectFile(
  doc: UIDocument,
  opts: { handle?: FileHandleLike; saveAs?: boolean; logger?: Logger } = {},
): Promise<SaveResult> {
  const log = opts.logger ?? defaultLogger
  return log.runTask('save project', async () => {
    const text = serializeProject(doc, { pretty: true })
    const fileName = safeName(doc.project.name) + PROJECT_FILE_EXT
    if (!hasFileSystemAccess()) {
      download(text, fileName)
      return { name: fileName }
    }
    const pick = fsa().showSaveFilePicker as NonNullable<FsaGlobal['showSaveFilePicker']>
    const handle =
      (!opts.saveAs && opts.handle) ||
      (await pick({ suggestedName: fileName, types: PICKER_TYPES }))
    const w = await handle.createWritable()
    await w.write(text)
    await w.close()
    return { name: handle.name, handle }
  })
}

async function pickText(): Promise<{ text: string; name: string; handle?: FileHandleLike }> {
  if (hasFileSystemAccess()) {
    const open = fsa().showOpenFilePicker as NonNullable<FsaGlobal['showOpenFilePicker']>
    const [handle] = await open({ types: PICKER_TYPES, multiple: false })
    const file = await handle.getFile()
    return { text: await file.text(), name: file.name, handle }
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.addEventListener('change', () => {
      const f = input.files?.[0]
      if (!f) return reject(new DOMException('no file selected', 'AbortError'))
      f.text().then((text) => resolve({ text, name: f.name }), reject)
    })
    input.addEventListener('cancel', () => reject(new DOMException('cancelled', 'AbortError')))
    input.click()
  })
}

export function openProjectFile(
  opts: { logger?: Logger } = {},
): Promise<ParsedProject & { name: string; handle?: FileHandleLike }> {
  const log = opts.logger ?? defaultLogger
  return log.runTask('open project', async () => {
    const picked = await pickText()
    return { ...parseProject(picked.text), name: picked.name, handle: picked.handle }
  })
}
