// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from './sanitize'

describe('sanitizeHtml', () => {
  it('script を除去し、中身も残さない', () => {
    const r = sanitizeHtml('<div>a</div><script>alert(1)</script>')
    expect(r.html).not.toContain('script')
    expect(r.html).not.toContain('alert')
    expect(r.warnings.some((w) => w.includes('<script>'))).toBe(true)
  })

  it('on* 属性を除去する', () => {
    const r = sanitizeHtml('<button onclick="alert(1)" onmouseover="x()">ok</button>')
    expect(r.html).not.toContain('onclick')
    expect(r.html).not.toContain('onmouseover')
    expect(r.html).toContain('ok')
    expect(r.warnings.some((w) => w.includes('on*'))).toBe(true)
  })

  it('javascript: URL を除去する', () => {
    const r = sanitizeHtml('<a href="javascript:alert(1)">x</a>')
    expect(r.html).not.toContain('javascript:')
  })

  it('iframe / link / meta / base を除去する', () => {
    const r = sanitizeHtml(
      '<link rel="stylesheet" href="https://e.com/a.css"><meta http-equiv="refresh" content="0;url=https://e.com"><base href="https://e.com/"><iframe src="https://e.com"></iframe><p>t</p>',
    )
    expect(r.html).not.toMatch(/<(link|meta|base|iframe)/)
    expect(r.html).toContain('<p>t</p>')
  })

  it('img の外部 src を data-ua-src に退避し、data: は残す', () => {
    const r = sanitizeHtml(
      '<img src="https://e.com/a.png" alt="a"><img src="logo.png"><img src="data:image/png;base64,AAAA">',
    )
    expect(r.html).not.toMatch(/\ssrc="(https|logo)/)
    expect(r.html).toContain('data-ua-src="https://e.com/a.png"')
    expect(r.html).toContain('data:image/png')
    expect(r.externalRefs).toEqual(['https://e.com/a.png', 'logo.png'])
  })

  it('CSS の @import を除去し、外部 url() を ua-ext: に置換する', () => {
    const r = sanitizeHtml(
      '<style>@import url(x.css); .a{background:url(https://e.com/a.png)} .b{background:url(data:image/png;base64,AA)}</style><div class="a" style="background:url(\'https://e.com/b.png\')">x</div>',
    )
    expect(r.html).not.toContain('@import')
    expect(r.html).not.toContain('https://e.com')
    expect(r.html).toContain('ua-ext:')
    expect(r.html).toContain('data:image/png')
    expect(r.externalRefs).toContain('https://e.com/a.png')
    expect(r.externalRefs).toContain('https://e.com/b.png')
  })

  it('先頭の <style> を残す', () => {
    const r = sanitizeHtml('<style>.a{color:red}</style><div class="a">x</div>')
    expect(r.html).toContain('.a{color:red}')
  })

  it('SVG: script は除去し、図形は残す', () => {
    const r = sanitizeHtml('<svg><script>alert(1)</script><rect width="10" height="10"/></svg>')
    expect(r.html).toContain('<rect')
    expect(r.html).not.toContain('script')
  })

  it('安全な HTML はそのまま、warnings なし', () => {
    const src = '<div class="a"><p>hi</p></div>'
    const r = sanitizeHtml(src)
    expect(r.html).toBe(src)
    expect(r.warnings).toEqual([])
    expect(r.externalRefs).toEqual([])
  })
})
