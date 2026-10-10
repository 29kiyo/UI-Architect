import { describe, expect, it } from 'vitest'
import type { ImportInput, Importer } from '@/core'
import { logger } from '@/shared'
import { detectImporters, runImport } from './select'

const make = (id: string, score: number | (() => number)): Importer => ({
  id,
  label: id,
  detect: () => (typeof score === 'function' ? score() : score),
  parse: async () => ({ nodes: [], assets: [], tokens: {}, warnings: [`parsed by ${id}`] }),
})

const input: ImportInput = { kind: 'text', text: '<div></div>', name: 'sample.html' }

describe('detectImporters', () => {
  it('score の高い順に並べ、0 は除外する', () => {
    const r = detectImporters(input, [make('a', 0.2), make('b', 0.9), make('c', 0)])
    expect(r.map((d) => d.importer.id)).toEqual(['b', 'a'])
  })

  it('同点は登録順、範囲外/NaN は丸める', () => {
    const r = detectImporters(input, [make('a', 0.5), make('b', 0.5), make('c', 5), make('d', NaN)])
    expect(r.map((d) => [d.importer.id, d.score])).toEqual([
      ['c', 1],
      ['a', 0.5],
      ['b', 0.5],
    ])
  })

  it('detect が throw しても他の Importer は評価される', () => {
    const bad = make('bad', () => {
      throw new Error('boom')
    })
    const r = detectImporters(input, [bad, make('ok', 0.3)])
    expect(r.map((d) => d.importer.id)).toEqual(['ok'])
  })
})

describe('runImport', () => {
  it('最高 score の Importer で parse する', async () => {
    const out = await runImport(input, {}, { importers: [make('a', 0.2), make('b', 0.8)] })
    expect(out.importerId).toBe('b')
    expect(out.result.warnings).toEqual(['parsed by b'])
  })

  it('importerId で手動選択できる(score 0 でも可)', async () => {
    const out = await runImport(
      input,
      {},
      { importerId: 'a', importers: [make('a', 0), make('b', 1)] },
    )
    expect(out.importerId).toBe('a')
  })

  it('該当なし/不明な id は reject する', async () => {
    await expect(runImport(input, {}, { importers: [make('a', 0)] })).rejects.toThrow()
    await expect(
      runImport(input, {}, { importerId: 'x', importers: [make('a', 1)] }),
    ).rejects.toThrow('importer not found')
  })

  it('実行ログに import タスクが記録される', async () => {
    logger.clear()
    await runImport(input, {}, { importers: [make('a', 1)] })
    expect(logger.getEntries().some((e) => e.message.startsWith('import:'))).toBe(true)
  })
})
