// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  createDocumentStore,
  createEmptyDocument,
  createHistory,
  createNode,
  type ImportInput,
  type Importer,
} from '@/core'
import { logger } from '@/shared'
import { analyzeInputs, commitPrepared, outlineOf, prepareImport } from './prepare'

const html = '<div class="a"><img src="logo.png" alt="l"><p>hi</p></div>'
const text = (t: string, name?: string): ImportInput => ({
  kind: 'text',
  text: t,
  ...(name ? { name } : {}),
})
const png: ImportInput = {
  kind: 'file',
  name: 'logo.png',
  mime: 'image/png',
  data: new Uint8Array([137, 80, 78, 71]).buffer as ArrayBuffer,
}
const svg = (name: string) => text('<svg width="1" height="1"></svg>', name)

describe('analyzeInputs', () => {
  it('対象入力と、各 Importer の score(高い順)を返す', () => {
    const a = analyzeInputs([png, text(html)])
    expect(a.primary).toBe(1)
    expect(a.candidates.map((c) => c.id)).toEqual(['html', 'svg', 'tsx'])
    expect(a.candidates[0].score).toBeGreaterThan(0)
    expect(a.scores[0]).toBe(0)
  })

  it('形式ごとに最上位が変わる', () => {
    expect(analyzeInputs([svg('a.svg')]).candidates[0].id).toBe('svg')
    expect(analyzeInputs([text('export const A = () => <div />', 'A.tsx')]).candidates[0].id).toBe(
      'tsx',
    )
  })

  it('対応なしは primary -1、入力なしは候補なし', () => {
    expect(analyzeInputs([text('hello')]).primary).toBe(-1)
    expect(analyzeInputs([])).toEqual({ primary: -1, candidates: [], scores: [] })
  })
})

describe('prepareImport', () => {
  it('HTML + 同時にドロップした画像で参照を解決する(ネットワーク不使用)', async () => {
    const p = await prepareImport([text(html, 'a.html'), png], { allowNetwork: false })
    expect(p.importerId).toBe('html')
    const img = p.result.nodes.find((n) => n.type === 'image')
    expect(p.result.assets).toHaveLength(1)
    expect(img?.props.content.src).toBe(`asset:${p.result.assets[0].id}`)
    expect(p.assetData.get(p.result.assets[0].id)?.data.byteLength).toBe(4)
  })

  it('手動選択、不明な id、対応なしを扱う', async () => {
    const p = await prepareImport([svg('a.svg')], { importerId: 'svg' })
    expect(p.importerId).toBe('svg')
    await expect(prepareImport([svg('a.svg')], { importerId: 'x' })).rejects.toThrow('not found')
    await expect(prepareImport([text('hello')])).rejects.toThrow('見つかりません')
    await expect(prepareImport([])).rejects.toThrow('入力がありません')
  })

  it('複数の文書は先頭だけ取り込み、残りは warnings', async () => {
    const p = await prepareImport([svg('a.svg'), svg('b.svg')])
    expect(p.ignored).toEqual(['b.svg'])
    expect(
      p.result.warnings.some((w) => w.includes('b.svg') && w.includes('取り込んでいません')),
    ).toBe(true)
  })

  it('width / deviceId を Importer に渡す', async () => {
    let width = 0
    let deviceId: string | undefined
    const importer: Importer = {
      id: 'x',
      label: 'X',
      detect: () => 1,
      parse: async (_i, ctx) => {
        deviceId = ctx.deviceId
        return { nodes: [createNode({ type: 'element' })], assets: [], tokens: {}, warnings: [] }
      },
    }
    await prepareImport([text('a')], {
      width: 390,
      deviceId: 'd1',
      importers: (c) => {
        width = c.width
        return [importer]
      },
    })
    expect(width).toBe(390)
    expect(deviceId).toBe('d1')
  })

  it('準備だけではドキュメントを変更しない', async () => {
    const store = createDocumentStore(createEmptyDocument('t'))
    const before = store.getState().doc
    await prepareImport([svg('a.svg')])
    expect(store.getState().doc).toBe(before)
  })
})

describe('commitPrepared / outlineOf', () => {
  it('確定は 1 履歴で、Undo 1 回で元に戻る。実行ログにも出る', async () => {
    const store = createDocumentStore(createEmptyDocument('t'))
    const history = createHistory(store)
    const before = store.getState().doc
    const p = await prepareImport([text(html, 'a.html'), png], { allowNetwork: false })

    logger.clear()
    expect(commitPrepared(history, p, { deviceId: before.devices[0].id })).toBe(true)
    expect(history.getState().undoCount).toBe(1)
    expect(store.getState().doc.assets).toHaveLength(1)
    expect(logger.getEntries().some((e) => e.message.startsWith('command: import:'))).toBe(true)

    history.undo()
    expect(store.getState().doc).toEqual(before)
  })

  it('outline は深さ付きで、limit で打ち切る', async () => {
    const p = await prepareImport([text(html, 'a.html'), png], { allowNetwork: false })
    const o = outlineOf(p.result)
    expect(o.total).toBe(p.result.nodes.length)
    expect(o.rows[0]).toEqual({ depth: 0, text: 'a.html [element]' })
    expect(o.rows.some((r) => r.text.includes('"hi"'))).toBe(true)
    expect(outlineOf(p.result, 2).rows).toHaveLength(2)
  })
})
