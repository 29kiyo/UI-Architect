import { createNode, createPage, PropsSchema, type Page } from '@/core'

// 計測用: ルート直下に group 個のコンテナ、各コンテナに per 個の子(合計 ≒ group*(per+1))
export function buildLargePage(total = 1000, per = 9): Page {
  const page = createPage('bench')
  const root = page.nodes[page.rootNodeId]!
  root.props = PropsSchema.parse({ position: { position: 'relative' }, size: { width: '1280px' } })
  let n = 1
  while (n < total) {
    const g = createNode({
      type: 'element',
      name: `g${n}`,
      props: PropsSchema.parse({
        layout: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
        size: { width: '600px' },
      }),
    })
    page.nodes[g.id] = g
    root.children.push(g.id)
    n++
    for (let i = 0; i < per && n < total; i++, n++) {
      const c = createNode({
        type: i % 3 === 0 ? 'text' : 'element',
        name: `n${n}`,
        props: PropsSchema.parse({
          size: { width: '56px', height: '24px' },
          appearance: { backgroundColor: '#dde' },
          content: { text: `n${n}` },
        }),
      })
      page.nodes[c.id] = c
      g.children.push(c.id)
    }
  }
  return page
}

export function timeIt<T>(label: string, fn: () => T, runs = 5): { label: string; ms: number } {
  const times: number[] = []
  for (let i = 0; i < runs; i++) {
    const t = performance.now()
    fn()
    times.push(performance.now() - t)
  }
  times.sort((a, b) => a - b)
  return { label, ms: Math.round(times[Math.floor(times.length / 2)]! * 100) / 100 }
}
