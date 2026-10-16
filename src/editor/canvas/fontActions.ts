import { AssetSchema, buildAsset, isFontName, type Asset, type Id } from '@/core'
import { logger } from '@/shared'
import type { EditEnv } from './actions'
import { createAddAssetCommand, type ImageSinks } from './imageActions'

export const isFontFile = (f: File): boolean => /^font\//.test(f.type) || isFontName(f.name)

// フォントを Asset として追加(同じ hash は既存を再利用)。1 履歴。登録は App 側の同期で行う
export function addFontFiles(env: EditEnv, files: File[], sinks: ImageSinks): Promise<Id[]> {
  return logger.runTask('add fonts', async () => {
    const known = new Map(env.doc.assets.map((a) => [a.hash, a]))
    const added: Asset[] = []
    for (const f of files) {
      const data = await f.arrayBuffer()
      const built = await buildAsset({ name: f.name, mime: f.type, data })
      if (built.asset.kind !== 'font' || known.has(built.asset.hash)) continue
      const asset = AssetSchema.parse(built.asset)
      known.set(asset.hash, asset)
      await sinks.blobs.put(asset.id, built.blob)
      added.push(asset)
    }
    if (added.length === 0) return []
    const run = () => {
      for (const a of added) env.history.execute(createAddAssetCommand(a))
    }
    if (added.length === 1) run()
    else env.history.transaction('add fonts', run)
    return added.map((a) => a.id)
  })
}
