import { describe, expect, it } from 'vitest'
import type { ImportInput, Node } from '@/core'
import { createHtmlImporter } from '../html/importer'
import { runImport } from '../select'
import { createSvgImporter } from '../svg/importer'
import { createTsxImporter, detectTsx } from './importer'

const glob = import.meta.glob<string>('../../../tests/fixtures/tsx/*', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const files = Object.fromEntries(
  Object.entries(glob).map(([p, t]) => [p.split('/').pop() as string, t]),
)

const importer = createTsxImporter()
const parse = (text: string, name = 'X.tsx') => importer.parse({ kind: 'text', name, text }, {})
const find = (nodes: Node[], tag: string) => nodes.find((n) => n.props.custom.tag === tag)
const propsOf = (root: Node) =>
  root.props.custom.componentProps as unknown as Record<string, string | boolean>[]

describe('fixtures', () => {
  it('Button.tsx: props・既定値・JSX を取り込む', async () => {
    const r = await parse(files['Button.tsx'], 'Button.tsx')
    const root = r.nodes[0]
    expect(root.name).toBe('Button')
    const props = propsOf(root)
    expect(props.map((p) => p.name)).toEqual(['variant', 'size', 'disabled', 'label', 'onClick'])
    expect(props[0]).toMatchObject({
      type: "'primary' | 'secondary' | 'ghost'",
      optional: true,
      defaultValue: "'primary'",
      description: 'ボタンの見た目',
    })
    expect(props[3]).toMatchObject({ name: 'label', optional: false })
    const button = find(r.nodes, 'button')
    expect(r.nodes).toHaveLength(2)
    expect(button?.props.content.text).toBe('{label}')
    expect(button?.props.custom.handlers).toEqual(['onClick'])
    expect(button?.props.custom.bindings).toMatchObject({ disabled: 'disabled' })
    expect(r.warnings.some((w) => w.includes('動的な式'))).toBe(true)
  })

  it('Button.d.ts: props のみ(ルート + コンポーネント1ノード)', async () => {
    const r = await parse(files['Button.d.ts'], 'Button.d.ts')
    expect(r.nodes).toHaveLength(2)
    expect(r.nodes[0].props.custom.sourceKind).toBe('d.ts')
    const props = propsOf(r.nodes[0])
    expect(props.map((p) => p.name)).toEqual(['variant', 'size', 'disabled', 'label', 'onClick'])
    expect(props[0].description).toBe('ボタンの見た目')
    expect(props[0].defaultValue).toBeUndefined()
  })

  it('Card.tsx: React.FC<P>・style・条件付き要素', async () => {
    const r = await parse(files['Card.tsx'], 'Card.tsx')
    const props = propsOf(r.nodes[0])
    expect(props.map((p) => [p.name, p.optional])).toEqual([
      ['title', false],
      ['description', true],
      ['imageUrl', true],
    ])
    const div = find(r.nodes, 'div')
    expect(div?.props.size.width).toBe('240px')
    expect(div?.props.layout.paddingTop).toBe('16px')
    expect(div?.props.radius.borderTopLeftRadius).toBe('8px')
    expect(div?.props.appearance.backgroundColor).toBe('#ffffff')
    const img = find(r.nodes, 'img')
    expect(img?.type).toBe('image')
    expect(img?.props.custom.condition).toBe('imageUrl')
    expect(img?.props.custom.bindings).toMatchObject({ src: 'imageUrl', alt: 'title' })
    expect(find(r.nodes, 'h2')?.props.typography.fontSize).toBe('18px')
    expect(find(r.nodes, 'button')?.props.custom.attrs).toEqual({ type: 'button' })
    expect(find(r.nodes, 'button')?.props.content.text).toBe('詳細')
  })

  it('全ノードが到達可能で ID が一意', async () => {
    for (const name of ['Button.tsx', 'Card.tsx', 'Button.d.ts']) {
      const r = await parse(files[name], name)
      const ids = new Set(r.nodes.map((n) => n.id))
      expect(ids.size).toBe(r.nodes.length)
      for (const n of r.nodes) for (const c of n.children) expect(ids.has(c)).toBe(true)
    }
  })
})

describe('JSX の変換', () => {
  it('Fragment を展開し、テキストと要素の混在を分ける', async () => {
    const r = await parse('export const A = () => (<><h1>Hi</h1><p>x <b>y</b> z</p></>)')
    expect(r.nodes).toHaveLength(6)
    expect(r.nodes[0].children).toHaveLength(2)
    const p = find(r.nodes, 'p') as Node
    const byId = new Map(r.nodes.map((n) => [n.id, n]))
    expect(p.children.map((id) => byId.get(id)?.type)).toEqual(['text', 'element', 'text'])
  })

  it('三項演算子は両枝を取り、else 側は hidden', async () => {
    const r = await parse(
      'export function A({ on }: { on: boolean }) { return on ? <span>on</span> : <span>off</span> }',
    )
    const spans = r.nodes.filter((n) => n.props.custom.tag === 'span')
    expect(spans.map((n) => n.props.custom.condition)).toEqual(['on', '!(on)'])
    expect(spans.map((n) => n.hidden)).toEqual([false, true])
    expect(propsOf(r.nodes[0]).map((p) => p.name)).toEqual(['on'])
  })

  it('.map は展開せずプレースホルダー + warnings', async () => {
    const r = await parse(
      'export const L = ({ items }: { items: string[] }) => <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>',
    )
    const ul = find(r.nodes, 'ul')
    expect(String(ul?.props.content.text)).toContain('{items.map')
    expect(r.warnings.some((w) => w.includes('.map'))).toBe(true)
  })

  it('未解決のコンポーネントは汎用コンテナ + warnings', async () => {
    const r = await parse('export const A = () => <div><Foo bar="1" /></div>')
    const foo = find(r.nodes, 'Foo')
    expect(foo?.props.custom.componentUse).toBe(true)
    expect(foo?.props.custom.attrs).toEqual({ bar: '1' })
    expect(r.warnings.some((w) => w.includes('<Foo>'))).toBe(true)
  })

  it('動的な style は静的部分だけ変換し bindings に残す', async () => {
    const r = await parse(
      'export const A = ({ w }: { w: number }) => <div style={{ width: w, height: 10 }} />',
    )
    const div = find(r.nodes, 'div')
    expect(div?.props.size.height).toBe('10px')
    expect(div?.props.custom.bindings).toHaveProperty('style')
    expect(r.warnings.some((w) => w.includes('動的な style'))).toBe(true)
  })

  it('未対応の style キーは unmappedStyle に保持する', async () => {
    const r = await parse('export const A = () => <div style={{ clipPath: "circle(50%)" }} />')
    expect(find(r.nodes, 'div')?.props.custom.unmappedStyle).toEqual({ 'clip-path': 'circle(50%)' })
  })
})

describe('props の解決', () => {
  it('interface の extends を展開する', async () => {
    const r = await parse(
      'interface Base { id: string }\ninterface P extends Base { label?: string }\nexport const A = (p: P) => <i />',
    )
    expect(propsOf(r.nodes[0]).map((p) => p.name)).toEqual(['id', 'label'])
  })

  it('外部型は展開せず warnings に出す', async () => {
    const r = await parse('export const A = (p: Ext.Props) => <i />')
    expect(propsOf(r.nodes[0])).toEqual([])
    expect(r.warnings.some((w) => w.includes('Ext.Props'))).toBe(true)
  })

  it('コンポーネントが無ければ reject する', async () => {
    await expect(parse('export const x = 1')).rejects.toThrow('見つかりません')
  })

  it('複数のコンポーネントは default/先頭を採用し、残りを warnings に出す', async () => {
    const r = await parse(
      'export const A = () => <a />\nexport default function B() { return <b /> }',
    )
    expect(r.nodes[0].name).toBe('B')
    expect(r.warnings.some((w) => w.includes('A'))).toBe(true)
  })
})

describe('detectTsx / runImport', () => {
  const t = (text: string, name?: string): ImportInput => ({
    kind: 'text',
    text,
    ...(name ? { name } : {}),
  })
  it('スコアを返す', () => {
    expect(detectTsx(t('', 'A.tsx'))).toBe(0.95)
    expect(detectTsx(t('', 'A.d.ts'))).toBe(0.95)
    expect(detectTsx(t('import x from "y"\nexport const A = () => <div></div>'))).toBe(0.6)
    expect(detectTsx(t('export declare const A: number'))).toBe(0.5)
    expect(detectTsx(t('<div></div>', 'a.html'))).toBe(0)
    expect(detectTsx(t('<svg></svg>'))).toBe(0)
  })

  it('3つの Importer を並べても Button.tsx は tsx が選ばれる', async () => {
    const html = createHtmlImporter({
      render: async () => {
        throw new Error('呼ばれない')
      },
    })
    const out = await runImport(
      { kind: 'text', name: 'Button.tsx', text: files['Button.tsx'] },
      {},
      { importers: [html, createSvgImporter(), importer] },
    )
    expect(out.importerId).toBe('tsx')
  })
})
