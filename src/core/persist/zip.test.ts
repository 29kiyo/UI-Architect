import { describe, expect, it } from 'vitest'
import { createEmptyDocument, type Asset } from '../model'
import {
  createMemoryBlobStore,
  exportProjectZip,
  importProjectZip,
  isZipBytes,
  loadProjectBytes,
  ProjectLoadError,
  serializeProject,
} from './index'

const asset = (id: string, mime: string, name: string): Asset => ({
  id,
  kind: mime.startsWith('font/') ? 'font' : 'image',
  name,
  mime,
  hash: `h-${id}`,
  size: 3,
})
const bytes = (...n: number[]) => new Uint8Array(n).buffer as ArrayBuffer
const arr = (b: ArrayBuffer) => Array.from(new Uint8Array(b))

async function fixture() {
  const doc = createEmptyDocument('zip test')
  doc.assets = [asset('a1', 'image/png', 'a.png'), asset('f1', 'font/woff2', 'f.woff2')]
  const store = createMemoryBlobStore()
  await store.put('a1', { mime: 'image/png', data: bytes(1, 2, 3) })
  await store.put('f1', { mime: 'font/woff2', data: bytes(4, 5, 6) })
  return { doc, store }
}

describe('project zip', () => {
  it('書き出し → 読込で doc とバイナリが復元される', async () => {
    const { doc, store } = await fixture()
    const out = await exportProjectZip(doc, store, { now: 1 })
    expect(out.warnings).toEqual([])
    expect(isZipBytes(out.data)).toBe(true)
    const loaded = await loadProjectBytes(out.data)
    expect(loaded.doc).toEqual(doc)
    expect(loaded.warnings).toEqual([])
    expect([...loaded.assetData.keys()].sort()).toEqual(['a1', 'f1'])
    expect(arr(loaded.assetData.get('a1')!.data)).toEqual([1, 2, 3])
    expect(loaded.assetData.get('f1')!.mime).toBe('font/woff2')
  })

  it('Blob が無い asset は警告にして書き出し、読込側も警告する', async () => {
    const { doc } = await fixture()
    const out = await exportProjectZip(doc, createMemoryBlobStore())
    expect(out.warnings).toHaveLength(2)
    const loaded = await importProjectZip(out.data)
    expect(loaded.doc.assets).toHaveLength(2)
    expect(loaded.assetData.size).toBe(0)
    expect(loaded.warnings).toHaveLength(2)
  })

  it('従来の JSON 形式もそのまま読める(assetData は空)', async () => {
    const { doc } = await fixture()
    const text = serializeProject(doc)
    const loaded = await loadProjectBytes(new TextEncoder().encode(text))
    expect(loaded.doc).toEqual(doc)
    expect(loaded.assetData.size).toBe(0)
  })

  it('壊れた入力は ProjectLoadError', async () => {
    await expect(loadProjectBytes(new Uint8Array([0x50, 0x4b, 1, 2]))).rejects.toBeInstanceOf(
      ProjectLoadError,
    )
    await expect(loadProjectBytes(new TextEncoder().encode('not json'))).rejects.toBeInstanceOf(
      ProjectLoadError,
    )
  })
})
