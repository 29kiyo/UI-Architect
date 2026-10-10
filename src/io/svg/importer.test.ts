// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ImportInput } from '@/core'
import { createHtmlImporter } from '../html/importer'
import { runImport } from '../select'
import { createSvgImporter, detectSvg } from './importer'

const importer = createSvgImporter()
const parse = (text: string, name?: string) =>
  importer.parse({ kind: 'text', text, ...(name ? { name } : {}) }, {})

const t = (text: string, name?: string, mime?: string): ImportInput => ({
  kind: 'text',
  text,
  ...(name ? { name } : {}),
  ...(mime ? { mime } : {}),
})

describe('detectSvg', () => {
  it('スコアを返す', () => {
    expect(detectSvg(t('<svg></svg>', 'a.svg'))).toBe(0.95)
    expect(detectSvg(t('<svg></svg>', undefined, 'image/svg+xml'))).toBe(0.95)
    expect(detectSvg(t('<?xml version="1.0"?>\n<svg></svg>'))).toBe(0.9)
    expect(detectSvg(t('<svg></svg>'))).toBe(0.9)
    expect(detectSvg(t('not svg', 'a.svg'))).toBe(0.3)
    expect(detectSvg(t('<div><svg></svg></div>'))).toBe(0)
    expect(detectSvg(t('<!doctype html><html></html>'))).toBe(0)
    expect(
      detectSvg({ kind: 'file', name: 'a.png', mime: 'image/png', data: new ArrayBuffer(2) }),
    ).toBe(0)
  })
})

describe('svgImporter.parse', () => {
  it('svg ノード1つ + ルート(nodes[0])を返し、サイズを width/height から取る', async () => {
    const r = await parse(
      '<svg width="24" height="24px"><rect width="24" height="24"/></svg>',
      'icon.svg',
    )
    expect(r.nodes).toHaveLength(2)
    const [root, svg] = r.nodes
    expect(root.name).toBe('icon.svg')
    expect(root.children).toEqual([svg.id])
    expect(svg.type).toBe('svg')
    expect(svg.props.size).toEqual({ width: '24px', height: '24px' })
    expect(String(svg.props.content.svg)).toContain('<rect')
    expect(r.warnings).toEqual([])
  })

  it('width/height が無ければ viewBox から取る', async () => {
    const r = await parse('<svg viewBox="0 0 48 32"><path d="M0 0h10"/></svg>')
    expect(r.nodes[1].props.size).toEqual({ width: '48px', height: '32px' })
    expect(r.nodes[1].props.custom.viewBox).toBe('0 0 48 32')
  })

  it('% 指定は無視して viewBox を使い、どちらも無ければ warnings', async () => {
    const a = await parse('<svg width="100%" height="100%" viewBox="0 0 10 10"></svg>')
    expect(a.nodes[1].props.size).toEqual({ width: '10px', height: '10px' })
    const b = await parse('<svg></svg>')
    expect(b.nodes[1].props.size).toEqual({})
    expect(b.warnings.some((w) => w.includes('サイズ'))).toBe(true)
  })

  it('script / on* を除去し warnings に出す', async () => {
    const r = await parse(
      '<svg width="1" height="1" onload="alert(1)"><script>alert(2)</script><rect/></svg>',
    )
    const svg = String(r.nodes[1].props.content.svg)
    expect(svg).not.toMatch(/script|onload|alert/)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('XML プロローグ付きでも取り込める', async () => {
    const r = await parse(
      '<?xml version="1.0" encoding="UTF-8"?>\n<svg width="2" height="2"></svg>',
    )
    expect(r.nodes[1].type).toBe('svg')
  })

  it('SVG が複数あれば先頭のみ + warnings', async () => {
    const r = await importer.parse(
      t('<svg width="1" height="1"></svg><svg width="2" height="2"></svg>'),
      {},
    )
    expect(r.nodes[1].props.size).toEqual({ width: '1px', height: '1px' })
    expect(r.warnings.some((w) => w.includes('2 個'))).toBe(true)
  })

  it('SVG が無ければ reject する', async () => {
    await expect(parse('<p>x</p>')).rejects.toThrow('SVG要素')
  })

  it('ファイル(data)入力も読める', async () => {
    const data = new TextEncoder().encode('<svg width="3" height="3"></svg>').buffer as ArrayBuffer
    const r = await importer.parse({ kind: 'file', name: 'a.svg', mime: 'image/svg+xml', data }, {})
    expect(r.nodes[1].props.size).toEqual({ width: '3px', height: '3px' })
  })
})

describe('runImport 経由', () => {
  it('HTML Importer と並べても SVG が選ばれる', async () => {
    const html = createHtmlImporter({
      render: async () => {
        throw new Error('呼ばれない')
      },
    })
    const out = await runImport(
      t('<svg width="1" height="1"></svg>', 'a.svg'),
      {},
      { importers: [html, importer] },
    )
    expect(out.importerId).toBe('svg')
  })
})
