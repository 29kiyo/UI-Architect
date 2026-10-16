import { describe, expect, it } from 'vitest'
import { createDocumentStore, createEmptyDocument, createHistory } from '../index'
import type { Asset, UIDocument } from '../model'
import { findUnusedAssets } from './usage'
import {
  assetWarnings,
  createRemoveAssetsCommand,
  createReplaceAssetCommand,
  removableAssetIds,
  replaceAssetRefs,
} from './manage'

const asset = (id: string, o: Partial<Asset> = {}): Asset => ({
  id,
  kind: 'image',
  name: `${id}.png`,
  mime: 'image/png',
  hash: `h-${id}`,
  size: 10,
  ...o,
})

function makeDoc(): UIDocument {
  const doc = createEmptyDocument('t')
  doc.assets = [
    asset('a1'),
    asset('a2'),
    asset('a10'),
    asset('f1', { kind: 'font', name: 'F.woff2' }),
  ]
  const page = doc.pages[0]
  const root = page.nodes[page.rootNodeId]
  root.props.content.src = 'asset:a1'
  root.props.appearance.backgroundImage = 'url("asset:a1"), url("asset:a10")'
  ;(page.overrides as Record<string, unknown>)['d1'] = {
    [page.rootNodeId]: { propsDiff: { content: { src: 'asset:a1' } }, detached: false },
  }
  return doc
}

describe('replaceAssetRefs', () => {
  it('node / override / background の参照を置換し、a10 のような前方一致は巻き込まない', () => {
    const doc = makeDoc()
    const n = replaceAssetRefs(doc, 'a1', 'a2')
    expect(n).toBe(3)
    const root = doc.pages[0].nodes[doc.pages[0].rootNodeId]
    expect(root.props.content.src).toBe('asset:a2')
    expect(root.props.appearance.backgroundImage).toBe('url("asset:a2"), url("asset:a10")')
    expect(replaceAssetRefs(doc, 'a1', 'a1')).toBe(0)
  })
})

describe('commands', () => {
  it('置換は 1 履歴で、元は未使用になり、Undo で戻る', () => {
    const store = createDocumentStore(makeDoc())
    const history = createHistory(store)
    history.execute(createReplaceAssetCommand('a1', 'a2'))
    expect(findUnusedAssets(store.getState().doc).map((a) => a.id)).toContain('a1')
    history.undo()
    expect(findUnusedAssets(store.getState().doc).map((a) => a.id)).not.toContain('a1')
  })
  it('種類が違う置換は拒否される', () => {
    const store = createDocumentStore(makeDoc())
    const history = createHistory(store)
    expect(() => history.execute(createReplaceAssetCommand('a1', 'f1'))).toThrow()
    expect(
      store.getState().doc.pages[0].nodes[store.getState().doc.pages[0].rootNodeId].props.content
        .src,
    ).toBe('asset:a1')
  })
  it('削除は未使用だけ。使用中は残る', () => {
    const store = createDocumentStore(makeDoc())
    const history = createHistory(store)
    expect(removableAssetIds(store.getState().doc, ['a1', 'a2', 'a10'])).toEqual(['a2'])
    history.execute(createRemoveAssetsCommand(['a1', 'a2']))
    expect(store.getState().doc.assets.map((a) => a.id)).toEqual(['a1', 'a10', 'f1'])
    history.undo()
    expect(store.getState().doc.assets).toHaveLength(4)
  })
})

describe('assetWarnings', () => {
  it('巨大サイズ・巨大寸法・フォント名重複・参照切れを返す', () => {
    const doc = makeDoc()
    doc.assets.push(
      asset('big', { size: 5 * 1024 * 1024, width: 8000, height: 100 }),
      asset('f2', { kind: 'font', name: 'F.ttf' }),
    )
    doc.pages[0].nodes[doc.pages[0].rootNodeId].props.content.src = 'asset:zz'
    const codes = assetWarnings(doc)
      .map((w) => w.code)
      .sort()
    expect(codes).toEqual(['font-name-conflict', 'large-dimension', 'large-size', 'missing-ref'])
  })
  it('問題なければ空', () => {
    expect(assetWarnings(makeDoc())).toEqual([])
  })
})
