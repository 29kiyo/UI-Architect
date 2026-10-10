// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { classifyNodes, type Node } from '@/core'
import { createHtmlImporter, createSandboxRenderer, runImport } from './index'

type Label = { source: string; expected: [string, string][] }

const htmls = import.meta.glob<string>('../../tests/fixtures/html/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const labels = Object.values(
  import.meta.glob<Label>('../../tests/fixtures/labels/*.json', {
    import: 'default',
    eager: true,
  }),
)
const htmlByName = Object.fromEntries(
  Object.entries(htmls).map(([p, t]) => [p.split('/').pop() as string, t]),
)

// nodes[0](ルート)と text ノードを除く前順
function preorder(nodes: Node[]): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out: Node[] = []
  const walk = (n: Node) => {
    for (const id of n.children) {
      const c = byId.get(id) as Node
      if (c.type !== 'text') out.push(c)
      walk(c)
    }
  }
  walk(nodes[0])
  return out
}

describe('fixtures の分類正解率', () => {
  it('正解率 90% 以上(不一致は一覧表示)', async () => {
    const importers = [createHtmlImporter({ render: createSandboxRenderer() })]
    let total = 0
    let ok = 0
    const mismatches: string[] = []
    for (const label of labels) {
      const text = htmlByName[label.source]
      const { result } = await runImport(
        { kind: 'text', name: label.source, text },
        {},
        { importers },
      )
      const got = preorder(classifyNodes(result.nodes))
      label.expected.forEach(([name, category], i) => {
        total++
        const n = got[i]
        if (n && n.name === name && n.category === category) ok++
        else
          mismatches.push(
            `${label.source}[${i}] 期待 ${name}=${category} / 実際 ${n?.name}=${n?.category}`,
          )
      })
      if (got.length !== label.expected.length) {
        mismatches.push(
          `${label.source}: ノード数 期待 ${label.expected.length} / 実際 ${got.length}`,
        )
      }
    }
    expect(total).toBeGreaterThan(0)
    expect(ok / total, mismatches.join('\n')).toBeGreaterThanOrEqual(0.9)
  })
})
