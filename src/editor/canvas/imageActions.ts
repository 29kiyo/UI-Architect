import {
  addNode,
  editablePages,
  AssetSchema,
  buildAsset,
  createImageNode,
  type Asset,
  type AssetUrlStore,
  type BlobStore,
  type Command,
  type Id,
  type Node,
} from '@/core'
import { logger } from '@/shared'
import type { EditEnv } from './actions'
import { findPage } from './commands'
import { planPaletteDrop } from './palette'
import { selectionStore } from './selection'
import type { Point, WorldRect } from './viewport'

export type ImageItem = { asset: Asset; node: Node; parentId: Id }
export type ImageSinks = { blobs: BlobStore; urls: AssetUrlStore }
export type FileDropAt = {
  deviceId: Id
  hitId: Id | undefined
  world: Point
  rectOf: (id: Id) => WorldRect | undefined
}

// Asset 追加(まだ無ければ)と画像ノード追加を 1 Command にまとめる
export const createAddImagesCommand = (pageId: Id, items: ImageItem[]): Command => ({
  name: items.length === 1 ? 'add-image' : 'add-images',
  apply: (d) => {
    const page = findPage(editablePages(d), pageId)
    for (const it of items) {
      if (!d.assets.some((a) => a.id === it.asset.id)) d.assets.push(AssetSchema.parse(it.asset))
      addNode(page, structuredClone(it.node), it.parentId)
    }
  },
})

export const imageFilesOf = (data: DataTransfer | null): File[] =>
  Array.from(data?.files ?? []).filter((f) => f.type.startsWith('image/'))

// 画像の実サイズ(DOM が必要)。読めなければ undefined
export function readImageSize(
  data: ArrayBuffer,
  mime: string,
): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([data], { type: mime }))
    const img = new Image()
    const done = (v: { width: number; height: number } | undefined) => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(v)
    }
    const timer = setTimeout(() => done(undefined), 5000)
    img.onload = () =>
      done(
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? { width: img.naturalWidth, height: img.naturalHeight }
          : undefined,
      )
    img.onerror = () => done(undefined)
    img.src = url
  })
}

// 画像ファイルを Asset 化して配置する(画像以外は無視)。at が無ければ末尾に追加。
// バイナリは先に保存し、ドキュメントの変更は 1 Command(Undo 1 回)
export function addImageFiles(
  env: EditEnv,
  files: File[],
  sinks: ImageSinks,
  at?: FileDropAt,
): Promise<Id[]> {
  return logger.runTask('add images', async () => {
    const { doc, page, history } = env
    const known = new Map(doc.assets.map((a) => [a.hash, a]))
    const items: ImageItem[] = []
    for (const f of files) {
      const data = await f.arrayBuffer()
      const built = await buildAsset({ name: f.name || 'image', mime: f.type, data })
      if (built.asset.kind !== 'image') continue
      let asset = known.get(built.asset.hash)
      if (!asset) {
        const dims = await readImageSize(data, built.asset.mime)
        asset = dims ? { ...built.asset, ...dims } : built.asset
        known.set(asset.hash, asset)
        await sinks.blobs.put(asset.id, built.blob)
        sinks.urls.set(asset.id, built.blob)
      }
      const i = items.length
      const plan = planPaletteDrop(
        page,
        at?.hitId,
        'image',
        { x: (at?.world.x ?? 0) + i * 16, y: (at?.world.y ?? 0) + i * 16 },
        at?.rectOf ?? (() => undefined),
      )
      if (!plan) continue
      const node = createImageNode(asset)
      node.props.position = plan.node.props.position
      items.push({ asset, node, parentId: plan.parentId })
    }
    if (items.length === 0) return []
    history.execute(createAddImagesCommand(page.id, items))
    const ids = items.map((it) => it.node.id)
    const deviceId = at?.deviceId ?? selectionStore.getState().activeDeviceId ?? doc.devices[0]?.id
    if (deviceId) selectionStore.getState().pickMany(ids, deviceId, false)
    return ids
  })
}

export const createAddAssetCommand = (asset: Asset): Command => ({
  name: 'add-asset',
  apply: (d) => {
    if (!d.assets.some((a) => a.id === asset.id)) d.assets.push(AssetSchema.parse(asset))
  },
})

// 画像ファイル → Asset(同じ hash は既存を返す)。バイナリは保存するが、ドキュメントは変更しない
export async function prepareImageAsset(
  doc: { assets: readonly Asset[] },
  file: File,
  sinks: ImageSinks,
): Promise<Asset | undefined> {
  const data = await file.arrayBuffer()
  const built = await buildAsset({ name: file.name || 'image', mime: file.type, data })
  if (built.asset.kind !== 'image') return undefined
  const known = doc.assets.find((a) => a.hash === built.asset.hash)
  if (known) return known
  const dims = await readImageSize(data, built.asset.mime)
  const asset = dims ? { ...built.asset, ...dims } : built.asset
  await sinks.blobs.put(asset.id, built.blob)
  sinks.urls.set(asset.id, built.blob)
  return asset
}
