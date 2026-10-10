// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ImportInput } from '@/core'
import { runImport } from '../select'
import { convertDom } from './convert'
import { createHtmlImporter, detectHtml, type HtmlRenderer } from './importer'

// テスト用: jsdom の host 文書に描画する(本番は sandbox iframe)
const hostRender: HtmlRenderer = async (html) => {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  return {
    root: container,
    getStyle: (el) => {
      const cs = window.getComputedStyle(el)
      return (n) => cs.getPropertyValue(n)
    },
    getRect: () => null,
    dispose: () => container.remove(),
  }
}

const importer = createHtmlImporter({ render: hostRender })
const parse = (html: string, name?: string) =>
  importer.parse({ kind: 'text', text: html, ...(name ? { name } : {}) }, {})

describe('htmlImporter.parse', () => {
  it('ノード木・スタイル・テキストを変換する(nodes[0] がルート)', async () => {
    const r = await parse(
      '<div style="display:flex;width:100px"><p>Hello</p><button>OK</button></div>',
      'a.html',
    )
    const [root, div, p, button] = r.nodes
    expect(r.nodes).toHaveLength(4)
    expect(root.name).toBe('a.html')
    expect(root.children).toEqual([div.id])
    expect(div.children).toEqual([p.id, button.id])
    expect(div.props.layout.display).toBe('flex')
    expect(div.props.size.width).toBe('100px')
    expect(p.props.content.text).toBe('Hello')
    expect(p.props.custom.tag).toBe('p')
    expect(button.props.content.text).toBe('OK')
  })

  it('id が一意で、children が全て存在する', async () => {
    const r = await parse(
      '<ul><li>a</li><li>b</li></ul><section><div><span>x</span></div></section>',
    )
    const ids = new Set(r.nodes.map((n) => n.id))
    expect(ids.size).toBe(r.nodes.length)
    for (const n of r.nodes) for (const c of n.children) expect(ids.has(c)).toBe(true)
  })

  it('テキストと要素の混在は text ノードに分ける', async () => {
    const r = await parse('<p>Hello <b>World</b>!</p>')
    const p = r.nodes[1]
    expect(p.children).toHaveLength(3)
    const kids = r.nodes.slice(2)
    expect(kids.map((n) => n.type)).toEqual(['text', 'element', 'text'])
    expect(kids[0].props.content.text).toBe('Hello')
  })

  it('script は実行も変換もされず、warnings に出る', async () => {
    const r = await parse('<div>a</div><script>window.__x = 1</script>')
    expect((window as unknown as { __x?: number }).__x).toBeUndefined()
    expect(r.nodes.some((n) => n.props.custom.tag === 'script')).toBe(false)
    expect(r.warnings.some((w) => w.includes('<script>'))).toBe(true)
  })

  it('img は外部 URL を content.src に戻す', async () => {
    const r = await parse('<img src="https://e.com/a.png" alt="logo">')
    const img = r.nodes[1]
    expect(img.type).toBe('image')
    expect(img.props.content).toMatchObject({ src: 'https://e.com/a.png', alt: 'logo' })
    expect(r.warnings.some((w) => w.includes('外部参照'))).toBe(true)
  })

  it('インライン svg は 1 ノードで content.svg に保持する', async () => {
    const r = await parse('<svg width="10" height="10"><rect width="10" height="10"/></svg>')
    expect(r.nodes).toHaveLength(2)
    expect(r.nodes[1].type).toBe('svg')
    expect(String(r.nodes[1].props.content.svg)).toContain('<rect')
  })

  it('未対応タグは汎用コンテナ + warnings', async () => {
    const r = await parse('<video></video>')
    expect(r.nodes[1].type).toBe('element')
    expect(r.warnings.some((w) => w.includes('<video>'))).toBe(true)
  })

  it('display:none は hidden', async () => {
    const r = await parse('<div style="display:none">x</div>')
    expect(r.nodes[1].hidden).toBe(true)
  })

  it('maxNodes を超えたら打ち切って warnings', async () => {
    const small = createHtmlImporter({ render: hostRender, maxNodes: 5 })
    const r = await small.parse({ kind: 'text', text: '<div></div>'.repeat(10) }, {})
    expect(r.nodes).toHaveLength(5)
    expect(r.warnings.some((w) => w.includes('上限'))).toBe(true)
  })

  it('描画後に dispose される', async () => {
    await parse('<p>x</p>')
    expect(document.body.children).toHaveLength(0)
  })
})

describe('convertDom', () => {
  it('元の座標を custom.sourceRect に丸めて保持する', () => {
    const c = document.createElement('div')
    c.innerHTML = '<p>x</p>'
    const r = convertDom({
      root: c,
      getStyle: () => () => '',
      getRect: (el) => (el.localName === 'p' ? { x: 1.234, y: 2, width: 10, height: 5 } : null),
    })
    expect(r.nodes[1].props.custom.sourceRect).toEqual({ x: 1.23, y: 2, width: 10, height: 5 })
  })
})

describe('detectHtml', () => {
  const t = (text: string, name?: string, mime?: string): ImportInput => ({
    kind: 'text',
    text,
    ...(name ? { name } : {}),
    ...(mime ? { mime } : {}),
  })
  it('スコアを返す', () => {
    expect(detectHtml(t('<!doctype html><html></html>'))).toBe(0.9)
    expect(detectHtml(t('<p>x</p>', 'a.html'))).toBe(0.9)
    expect(detectHtml(t('<p>x</p>'))).toBe(0.5)
    expect(detectHtml(t('<svg></svg>'))).toBe(0.1)
    expect(detectHtml(t('<div/>', 'A.tsx'))).toBe(0)
    expect(detectHtml(t('import x from "y"\nconst a = <div></div>'))).toBe(0.1)
    expect(detectHtml(t('hello'))).toBe(0)
    expect(
      detectHtml({ kind: 'file', name: 'a.png', mime: 'image/png', data: new ArrayBuffer(3) }),
    ).toBe(0)
  })
})

describe('runImport 経由', () => {
  it('detect で選ばれ、実行ログ付きで parse される', async () => {
    const out = await runImport(
      { kind: 'text', text: '<p>x</p>', name: 'a.html' },
      {},
      { importers: [importer] },
    )
    expect(out.importerId).toBe('html')
    expect(out.result.nodes).toHaveLength(2)
  })
})
