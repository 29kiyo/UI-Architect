import type { Asset } from '../model'
import type { AssetBlob } from '../persist'

export const FONT_EXTS = ['ttf', 'otf', 'woff', 'woff2']

export const isFontName = (name: string): boolean =>
  FONT_EXTS.includes(/\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '')

// font-family 名 = Asset 名の拡張子を除いたもの(CSS に安全な文字だけ残す)
export function fontFamilyOf(asset: Pick<Asset, 'id' | 'name'>): string {
  const stem = asset.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w\- .]/g, '')
    .trim()
  return stem || `font-${asset.id.slice(0, 6)}`
}

export const fontFamilyCss = (family: string): string => `"${family}"`

export type FontFaceLike = { load(): Promise<unknown> }
export type FontLoaderEnv = {
  create(family: string, data: ArrayBuffer): FontFaceLike
  add(face: FontFaceLike): void
  remove(face: FontFaceLike): void
}

const browserEnv = (): FontLoaderEnv => ({
  create: (family, data) => new FontFace(family, data),
  add: (f) => document.fonts.add(f as FontFace),
  remove: (f) => document.fonts.delete(f as FontFace),
})

export type FontLoader = {
  sync(
    assets: readonly Asset[],
    source: { get(id: string): Promise<AssetBlob | undefined> },
  ): Promise<void>
  loaded(): string[] // 登録済みの Asset id
}

// doc.assets の font を FontFace として登録し、無くなったものは解除する
export function createFontLoader(env?: FontLoaderEnv): FontLoader {
  const faces = new Map<string, FontFaceLike>()
  const pending = new Set<string>()
  return {
    async sync(assets, source) {
      const e = env ?? browserEnv()
      const fonts = assets.filter((a) => a.kind === 'font')
      const ids = new Set(fonts.map((a) => a.id))
      for (const [id, face] of [...faces]) {
        if (!ids.has(id)) {
          e.remove(face)
          faces.delete(id)
        }
      }
      await Promise.all(
        fonts.map(async (a) => {
          if (faces.has(a.id) || pending.has(a.id)) return
          pending.add(a.id)
          try {
            const blob = await source.get(a.id)
            if (!blob) return
            const face = e.create(fontFamilyOf(a), blob.data)
            await face.load()
            e.add(face)
            faces.set(a.id, face)
          } catch (err) {
            console.warn(`フォントを読み込めません: ${a.name}`, err)
          } finally {
            pending.delete(a.id)
          }
        }),
      )
    },
    loaded: () => [...faces.keys()],
  }
}
