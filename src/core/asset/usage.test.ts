import { describe, expect, it } from 'vitest'
import { createEmptyDocument, type Asset, type UIDocument } from '../model'
import {
  assetRefOf,
  findAssetUsages,
  findMissingAssetRefs,
  findUnusedAssets,
  groupUsagesByAsset,
} from './usage'

const asset = (id: string): Asset => ({
  id,
  kind: 'image',
  name: id,
  mime: 'image/png',
  hash: `h-${id}`,
  size: 1,
})

function makeDoc(): UIDocument {
  const doc = createEmptyDocument('t')
  doc.assets = [asset('a1'), asset('a2'), asset('a3')]
  const page = doc.pages[0]
  const root = page.nodes[page.rootNodeId]
  root.props.content.src = 'asset:a1'
  root.props.appearance.backgroundImage = 'url("asset:a2")'
  return doc
}

describe('asset usage', () => {
  it('assetRefOf は値全体が asset:<id> のときだけ返す', () => {
    expect(assetRefOf('asset:abc')).toBe('abc')
    expect(assetRefOf('url("asset:abc")')).toBeUndefined()
    expect(assetRefOf(1)).toBeUndefined()
  })
  it('ノードの src と background-image の参照を拾う', () => {
    const doc = makeDoc()
    const page = doc.pages[0]
    const u = findAssetUsages(doc)
    expect(u).toContainEqual({
      assetId: 'a1',
      area: 'node',
      pageId: page.id,
      nodeId: page.rootNodeId,
      path: 'content.src',
    })
    expect(u).toContainEqual({
      assetId: 'a2',
      area: 'node',
      pageId: page.id,
      nodeId: page.rootNodeId,
      path: 'appearance.backgroundImage',
    })
  })
  it('デバイス別 override の参照を拾う', () => {
    const doc = makeDoc()
    const page = doc.pages[0]
    ;(page.overrides as Record<string, unknown>)['d1'] = {
      [page.rootNodeId]: { propsDiff: { content: { src: 'asset:a3' } }, detached: false },
    }
    const u = findAssetUsages(doc).filter((x) => x.assetId === 'a3')
    expect(u).toHaveLength(1)
    expect(u[0]).toMatchObject({ area: 'override', deviceId: 'd1', path: 'propsDiff.content.src' })
  })
  it('未使用と参照切れを検出する', () => {
    const doc = makeDoc()
    expect(findUnusedAssets(doc).map((a) => a.id)).toEqual(['a3'])
    expect(findMissingAssetRefs(doc)).toEqual([])
    doc.pages[0].nodes[doc.pages[0].rootNodeId].props.content.src = 'asset:zz'
    expect(findMissingAssetRefs(doc).map((x) => x.assetId)).toEqual(['zz'])
  })
  it('asset ごとに使用箇所をまとめる', () => {
    const g = groupUsagesByAsset(findAssetUsages(makeDoc()))
    expect([...g.keys()].sort()).toEqual(['a1', 'a2'])
  })
})
