import { describe, expect, it } from 'vitest'
import { createNode, PropsSchema } from '@/core'
import { renderNodesHtml } from './compare'

describe('renderNodesHtml', () => {
  it('スタイルを inline で出し、テキストをエスケープし、外部 URL は描画しない', () => {
    const t = createNode({
      type: 'text',
      props: PropsSchema.parse({ content: { text: '<script>alert(1)</script>' } }),
    })
    const root = createNode({
      type: 'element',
      props: PropsSchema.parse({
        layout: { display: 'flex', flexDirection: 'column' },
        appearance: {
          backgroundImage: 'url("https://example.com/a.png")',
          backgroundColor: '#fff',
        },
      }),
      children: [t.id],
    })
    const html = renderNodesHtml([root, t])
    expect(html).toContain('display:flex')
    expect(html).toContain('flex-direction:column')
    expect(html).toContain('background-color:#fff')
    expect(html).not.toContain('example.com')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
