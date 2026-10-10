import { describe, expect, it } from 'vitest'
import {
  createDocumentStore,
  createEmptyDocument,
  createHistory,
  createNode,
  newId,
  type Asset,
  type ImportResult,
} from '@/core'
import { createImportCommand } from './commit'
import { createTsxImporter } from './tsx/importer'

const setup = () => {
  const store = createDocumentStore(createEmptyDocument('t'))
  const history = createHistory(store)
  return { store, history, doc: () => store.getState().doc }
}

const tree = (): ImportResult => {
  const leaf = createNode({ type: 'text', name: 'leaf' })
  const mid = createNode({ type: 'element', name: 'mid', children: [leaf.id] })
  const root = createNode({ type: 'element', name: 'Imported', children: [mid.id] })
  return { nodes: [root, mid, leaf], assets: [], tokens: {}, warnings: [] }
}

const asset = (hash: string): Asset => ({
  id: newId(),
  kind: 'image',
  name: 'a.png',
  mime: 'image/png',
  hash,
  size: 3,
})

describe('createImportCommand', () => {
  it('全ノードを 1 Command で追加し、Undo 1 回で完全に元へ戻り、Redo で復元する', () => {
    const s = setup()
    const before = s.doc()
    const r = tree()
    expect(s.history.execute(createImportCommand(r))).toBe(true)

    const after = s.doc()
    const page = after.pages[0]
    expect(Object.keys(page.nodes)).toHaveLength(4)
    expect(page.nodes[page.rootNodeId].children).toEqual([r.nodes[0].id])
    expect(s.history.getState().undoCount).toBe(1)
    expect(s.history.getState().undoName).toBe('import: Imported')

    expect(s.history.undo()).toBe(true)
    expect(s.doc()).toEqual(before)
    expect(s.history.getState().canUndo).toBe(false)

    expect(s.history.redo()).toBe(true)
    expect(s.doc()).toEqual(after)
  })

  it('index / parentId を指定できる', () => {
    const s = setup()
    const a = tree()
    const b = tree()
    s.history.execute(createImportCommand(a))
    s.history.execute(createImportCommand(b, { index: 0 }))
    const page = s.doc().pages[0]
    expect(page.nodes[page.rootNodeId].children).toEqual([b.nodes[0].id, a.nodes[0].id])

    const c = tree()
    s.history.execute(createImportCommand(c, { parentId: a.nodes[1].id }))
    expect(s.doc().pages[0].nodes[a.nodes[1].id].children).toEqual([a.nodes[2].id, c.nodes[0].id])
  })

  it('対象デバイスを root.props.custom.sourceDeviceId に記録する', () => {
    const s = setup()
    const deviceId = s.doc().devices[1].id
    const r = tree()
    s.history.execute(createImportCommand(r, { deviceId }))
    expect(s.doc().pages[0].nodes[r.nodes[0].id].props.custom.sourceDeviceId).toBe(deviceId)
  })

  it('Asset を追加し、既存と同じ hash は寄せてノードの参照も書き換える', () => {
    const s = setup()
    const existing = asset('h1')
    s.store.getState().update((d) => {
      d.assets.push(existing)
    })
    const dup = asset('h1')
    const fresh = asset('h2')
    const img = createNode({
      type: 'image',
      props: { content: { src: `asset:${dup.id}` } } as never,
    })
    const box = createNode({
      type: 'element',
      props: {
        appearance: { backgroundImage: `url("asset:${fresh.id}"), url("asset:${dup.id}")` },
      } as never,
    })
    const root = createNode({ type: 'element', children: [img.id, box.id] })
    s.history.execute(
      createImportCommand({
        nodes: [root, img, box],
        assets: [dup, fresh],
        tokens: {},
        warnings: [],
      }),
    )
    const doc = s.doc()
    expect(doc.assets.map((a) => a.hash)).toEqual(['h1', 'h2'])
    expect(doc.pages[0].nodes[img.id].props.content.src).toBe(`asset:${existing.id}`)
    expect(doc.pages[0].nodes[box.id].props.appearance.backgroundImage).toBe(
      `url("asset:${fresh.id}"), url("asset:${existing.id}")`,
    )
    s.history.undo()
    expect(s.doc().assets).toEqual([existing])
  })

  it('Importer の結果を変更・freeze しない', () => {
    const s = setup()
    const r = tree()
    const snapshot = JSON.stringify(r)
    s.history.execute(createImportCommand(r))
    expect(JSON.stringify(r)).toBe(snapshot)
    expect(Object.isFrozen(r.nodes[0])).toBe(false)
  })

  it('不正な結果は作成時に throw する(参照切れ・重複・孤立・二重参照・空)', () => {
    const r = tree()
    const broken = { ...r, nodes: [{ ...r.nodes[0], children: ['missing'] }, ...r.nodes.slice(1)] }
    expect(() => createImportCommand(broken)).toThrow('参照先')
    expect(() => createImportCommand({ ...r, nodes: [...r.nodes, r.nodes[2]] })).toThrow('重複')
    const orphan = createNode({ type: 'element' })
    expect(() => createImportCommand({ ...r, nodes: [...r.nodes, orphan] })).toThrow('到達')
    const shared = { ...r.nodes[0], children: [r.nodes[1].id, r.nodes[1].id] }
    expect(() => createImportCommand({ ...r, nodes: [shared, ...r.nodes.slice(1)] })).toThrow(
      '複数の親',
    )
    expect(() => createImportCommand({ ...r, nodes: [] })).toThrow('空')
  })

  it('既存 ID と衝突したら失敗し、ドキュメントも履歴も変わらない', () => {
    const s = setup()
    const r = tree()
    s.history.execute(createImportCommand(r))
    const after = s.doc()
    expect(() => s.history.execute(createImportCommand(r))).toThrow('already exists')
    expect(s.doc()).toBe(after)
    expect(s.history.getState().undoCount).toBe(1)
  })

  it('存在しないページ・親は失敗する', () => {
    const s = setup()
    expect(() => s.history.execute(createImportCommand(tree(), { pageId: 'nope' }))).toThrow(
      'ページ',
    )
    expect(() => s.history.execute(createImportCommand(tree(), { parentId: 'nope' }))).toThrow('親')
  })

  it('TSX Importer の結果も同様に取り込み・Undo できる', async () => {
    const s = setup()
    const before = s.doc()
    const r = await createTsxImporter().parse(
      { kind: 'text', name: 'A.tsx', text: 'export const A = () => <div><p>hi</p></div>' },
      {},
    )
    s.history.execute(createImportCommand(r))
    expect(Object.keys(s.doc().pages[0].nodes)).toHaveLength(r.nodes.length + 1)
    s.history.undo()
    expect(s.doc()).toEqual(before)
  })
})
