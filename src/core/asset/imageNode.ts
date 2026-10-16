import { createNode, PropsSchema, type Asset, type Node } from '../model'
import { toAssetRef } from './usage'

export const DEFAULT_IMAGE_MAX = 320

// 長辺が max を超えるときだけ縮小(拡大はしない)。サイズ不明は 4:3 の既定
export function fitSize(
  w: number,
  h: number,
  max = DEFAULT_IMAGE_MAX,
): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: max, height: Math.round(max * 0.75) }
  const s = Math.min(1, max / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) }
}

const altFromName = (name: string) => name.replace(/\.[^.]+$/, '')

export function createImageNode(asset: Asset, max = DEFAULT_IMAGE_MAX): Node {
  const { width, height } = fitSize(asset.width ?? 0, asset.height ?? 0, max)
  return createNode({
    type: 'image',
    category: 'image',
    name: asset.name,
    props: PropsSchema.parse({
      size: { width: `${width}px`, height: `${height}px` },
      content: { src: toAssetRef(asset.id), alt: altFromName(asset.name) },
      appearance: { objectFit: 'contain' },
    }),
  })
}
