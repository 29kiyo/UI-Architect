import { describe, expect, it } from 'vitest'
import { createNode } from '@/core'
import { parseCustomCss } from './customCss'
import { nodeStyle } from './style'

describe('parseCustomCss', () => {
  it('parses declarations into camelCase keys', () => {
    expect(parseCustomCss('color: red; letter-spacing: 2px;\n  mix-blend-mode:multiply')).toEqual({
      color: 'red',
      letterSpacing: '2px',
      mixBlendMode: 'multiply',
    })
  })
  it('drops comments, variables, vendor names and unsafe values', () => {
    expect(parseCustomCss('/* c */ color: red; --x: 1; -webkit-foo: 1')).toEqual({ color: 'red' })
    expect(
      parseCustomCss('a: b {x}; width: 1px !important; background: url(http://e.com/a.png)'),
    ).toEqual({})
    expect(parseCustomCss('width: expression(alert(1)); x')).toEqual({})
    expect(parseCustomCss('background-image: url(data:image/png;base64,AAAA)')).toEqual({})
  })
  it('is applied by nodeStyle after the groups', () => {
    const n = createNode({ type: 'element' })
    n.props.appearance.opacity = 1
    n.props.custom.customCss = 'opacity: 0.4; cursor: help'
    const s = nodeStyle(n) as Record<string, unknown>
    expect(s.opacity).toBe('0.4')
    expect(s.cursor).toBe('help')
  })
})
