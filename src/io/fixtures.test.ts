// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { NodeSchema, type Node } from '@/core'
import { createHtmlImporter, createSandboxRenderer, createSvgImporter, runImport } from './index'

const load = (g: Record<string, string>) =>
  Object.entries(g)
    .map(([path, text]) => ({ name: path.split('/').pop() as string, text }))
    .sort((a, b) => a.name.localeCompare(b.name))

const htmlFiles = load(
  import.meta.glob<string>('../../tests/fixtures/html/*.html', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)
const svgFiles = load(
  import.meta.glob<string>('../../tests/fixtures/svg/*.svg', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)

const importers = [createHtmlImporter({ render: createSandboxRenderer() }), createSvgImporter()]
const run = (name: string, text: string) =>
  runImport({ kind: 'text', name, text }, {}, { importers })

// nodes[0] がルートで、全ノードが到達可能・ID 一意・スキーマ適合
function expectValidTree(nodes: Node[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  expect(byId.size).toBe(nodes.length)
  for (const n of nodes) {
    NodeSchema.parse(n)
    for (const c of n.children) expect(byId.has(c)).toBe(true)
  }
  const seen = new Set<string>()
  const stack = [nodes[0].id]
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(byId.get(id)?.children ?? []))
  }
  expect(seen.size).toBe(nodes.length)
}

afterEach(() => {
  document.body.innerHTML = ''
  delete (window as unknown as { __fixtureExecuted?: boolean }).__fixtureExecuted
})

describe('fixtures', () => {
  it('見本が存在する', () => {
    expect(htmlFiles.length).toBeGreaterThanOrEqual(3)
    expect(svgFiles.length).toBeGreaterThanOrEqual(2)
  })

  it.each(htmlFiles.map((f) => [f.name, f.text]))('HTML %s を変換できる', async (name, text) => {
    const out = await run(name, text)
    expect(out.importerId).toBe('html')
    expect(out.result.nodes.length).toBeGreaterThan(2)
    expectValidTree(out.result.nodes)
  })

  it.each(svgFiles.map((f) => [f.name, f.text]))('SVG %s を変換できる', async (name, text) => {
    const out = await run(name, text)
    expect(out.importerId).toBe('svg')
    expect(out.result.nodes).toHaveLength(2)
    expectValidTree(out.result.nodes)
  })

  it('スクリプトは実行されず、出力にも残らない', async () => {
    const all = [...htmlFiles, ...svgFiles]
    const outputs: Node[][] = []
    for (const f of all) outputs.push((await run(f.name, f.text)).result.nodes)
    expect((window as unknown as { __fixtureExecuted?: boolean }).__fixtureExecuted).toBeUndefined()
    const json = JSON.stringify(outputs)
    expect(json).not.toContain('__fixtureExecuted')
    expect(json).not.toContain('onclick')
    expect(json).not.toContain('onload')
  })

  it('login.html: 入力欄・hover/disabled 状態・除去の warnings', async () => {
    const f = htmlFiles.find((x) => x.name === 'login.html')
    const { result } = await run('login.html', f?.text ?? '')
    const inputs = result.nodes.filter((n) => n.props.custom.tag === 'input')
    expect(inputs.map((n) => n.props.content.placeholder)).toEqual(['メールアドレス', 'パスワード'])
    const button = result.nodes.find((n) => n.props.custom.tag === 'button')
    expect(button?.props.states).toHaveProperty('hover')
    expect(button?.props.states).toHaveProperty('disabled')
    expect(result.warnings.some((w) => w.includes('<script>'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('on*'))).toBe(true)
  })

  it('card-list.html: 外部画像を保留し、display:none は hidden', async () => {
    const f = htmlFiles.find((x) => x.name === 'card-list.html')
    const { result } = await run('card-list.html', f?.text ?? '')
    const imgs = result.nodes.filter((n) => n.type === 'image')
    expect(imgs.map((n) => n.props.content.src)).toEqual([
      'https://example.com/a.png',
      'images/b.png',
    ])
    expect(result.nodes.some((n) => n.hidden)).toBe(true)
    expect(result.warnings.some((w) => w.includes('外部参照'))).toBe(true)
  })

  it('logo-unsafe.svg: script/on* を除去し warnings に出す', async () => {
    const f = svgFiles.find((x) => x.name === 'logo-unsafe.svg')
    const { result } = await run('logo-unsafe.svg', f?.text ?? '')
    expect(result.nodes[1].props.size).toEqual({ width: '120px', height: '40px' })
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})
