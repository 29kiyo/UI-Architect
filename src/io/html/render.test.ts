// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createSandboxRenderer } from './render'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('createSandboxRenderer', () => {
  it('sandbox は allow-same-origin のみ(allow-scripts なし)で、CSP が付く', async () => {
    const render = createSandboxRenderer()
    const doc = await render('<p>x</p>', {})
    const iframe = document.querySelector('iframe')
    expect(iframe?.getAttribute('sandbox')).toBe('allow-same-origin')
    expect(iframe?.getAttribute('srcdoc')).toContain('Content-Security-Policy')
    doc.dispose()
  })

  it('描画した DOM とスタイルを読める', async () => {
    const render = createSandboxRenderer()
    const doc = await render('<style>p{color:red}</style><p>x</p>', {})
    const p = doc.root.querySelector('p')
    expect(p?.textContent).toBe('x')
    expect(p && doc.getStyle(p)('color')).toBe('rgb(255, 0, 0)')
    expect(p && doc.getRect(p)).toMatchObject({ width: expect.any(Number) })
    doc.dispose()
  })

  it('dispose で iframe が消える', async () => {
    const doc = await createSandboxRenderer()('<p>x</p>', {})
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
    doc.dispose()
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })

  it('中断済みの signal は reject し、iframe を作らない', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(createSandboxRenderer()('<p>x</p>', { signal: ac.signal })).rejects.toBeDefined()
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })
})
