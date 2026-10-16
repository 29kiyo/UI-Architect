// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { applySvgColor, createSvgNode, sanitizeSvg, toCurrentColor } from './svg'

const BAD =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12" onload="x()">' +
  '<script>alert(1)</script><image href="https://e.com/a.png"/>' +
  '<rect width="5" height="5" fill="#f00" style="filter:url(https://e.com/f)"/></svg>'

describe('sanitizeSvg', () => {
  it('script・on*・外部参照を除去し、viewBox からサイズを取る', () => {
    const r = sanitizeSvg(BAD)
    expect(r.svg).not.toMatch(/script|onload|e\.com/i)
    expect(r.svg).toContain('<rect')
    expect(r).toMatchObject({ width: 24, height: 12, viewBox: '0 0 24 12' })
    expect(r.warnings.length).toBeGreaterThan(0)
  })
  it('svg が無ければ throw', () => {
    expect(() => sanitizeSvg('<div>x</div>')).toThrow()
  })
})

describe('toCurrentColor', () => {
  it('単色は currentColor にする(属性と style)', () => {
    const a = toCurrentColor(
      '<svg viewBox="0 0 1 1"><path d="M0" fill="#123456"/><path d="M1" style="fill:#123456"/></svg>',
    )
    expect(a.converted).toBe(true)
    expect(a.svg).not.toContain('#123456')
    expect(a.svg.match(/currentColor/g)?.length).toBe(2)
  })
  it('stroke だけのアイコン(fill=none)も変換し none は保つ', () => {
    const a = toCurrentColor('<svg><path fill="none" stroke="#000"/></svg>')
    expect(a.svg).toContain('fill="none"')
    expect(a.svg).toContain('stroke="currentColor"')
  })
  it('多色は変更しない。色指定が全く無ければ root に fill を付ける', () => {
    const multi = '<svg><path fill="#f00"/><path fill="#00f"/></svg>'
    expect(toCurrentColor(multi)).toEqual({ svg: multi, converted: false })
    const plain = toCurrentColor('<svg><path d="M0"/></svg>')
    expect(plain.converted).toBe(true)
    expect(plain.svg).toContain('fill="currentColor"')
  })
})

describe('applySvgColor / createSvgNode', () => {
  it('色を置換し、不正な値は黒にする', () => {
    expect(applySvgColor('<svg fill="currentColor"/>', '#ff0000')).toContain('#ff0000')
    expect(applySvgColor('<svg fill="currentColor"/>', 'red;}<x>')).toContain('#000000')
    expect(applySvgColor('<svg fill="currentColor"/>', 'var(--token-colors-a)')).toContain(
      '#000000',
    )
  })
  it('icon カテゴリの svg ノードを作る(長辺 64px)', () => {
    const n = createSvgNode(
      { svg: '<svg/>', width: 128, height: 64, viewBox: '0 0 128 64', warnings: [] },
      'logo',
    )
    expect(n).toMatchObject({ type: 'svg', category: 'icon', name: 'logo' })
    expect(n.props.size).toMatchObject({ width: '64px', height: '32px' })
    expect(n.props.content.svg).toBe('<svg/>')
  })
})
