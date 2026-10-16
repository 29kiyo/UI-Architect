import { describe, expect, it } from 'vitest'
import { assetKindOfMime, extFromMime, mimeFromName, resolveMime } from './kind'

describe('asset kind', () => {
  it('ファイル名から mime を引く(クエリ・大文字小文字を無視)', () => {
    expect(mimeFromName('a.PNG?x=1')).toBe('image/png')
    expect(mimeFromName('f.woff2')).toBe('font/woff2')
    expect(mimeFromName('x.unknown')).toBe('application/octet-stream')
  })
  it('mime が空/octet-stream のときだけ名前から補う', () => {
    expect(resolveMime('a.png', '')).toBe('image/png')
    expect(resolveMime('a.png', 'application/octet-stream')).toBe('image/png')
    expect(resolveMime('a.png', 'image/webp')).toBe('image/webp')
    expect(resolveMime('a.png', 'IMAGE/WEBP; charset=x')).toBe('image/webp')
  })
  it('mime から kind を判定する', () => {
    expect(assetKindOfMime('image/svg+xml')).toBe('svg')
    expect(assetKindOfMime('image/png')).toBe('image')
    expect(assetKindOfMime('font/ttf')).toBe('font')
    expect(assetKindOfMime('application/font-woff')).toBe('font')
    expect(assetKindOfMime('video/mp4')).toBe('video')
    expect(assetKindOfMime('audio/mpeg')).toBe('audio')
    expect(assetKindOfMime('text/plain')).toBe('other')
  })
  it('mime から拡張子を引く', () => {
    expect(extFromMime('image/jpeg')).toBe('jpg')
    expect(extFromMime('font/woff2')).toBe('woff2')
    expect(extFromMime('text/plain')).toBeUndefined()
  })
})
