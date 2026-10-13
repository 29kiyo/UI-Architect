import { describe, expect, it } from 'vitest'
import { findTokenByRef, tokenRef, tokenStyle, tokenVarName } from './tokenVars'

const tokens = {
  colors: { primary: '#ff0000', 'bad name': 'red', evil: 'red;}' },
  spacing: { sm: '4px' },
  fonts: { body: 'Inter, sans-serif' },
}

describe('tokenVars', () => {
  it('builds var names and refs', () => {
    expect(tokenVarName('colors', 'primary')).toBe('--token-colors-primary')
    expect(tokenVarName('colors', 'bad name')).toBe('--token-colors-bad-name')
    expect(tokenRef('spacing', 'sm')).toBe('var(--token-spacing-sm)')
  })
  it('injects values and skips unsafe ones', () => {
    const s = tokenStyle(tokens) as Record<string, string>
    expect(s['--token-colors-primary']).toBe('#ff0000')
    expect(s['--token-spacing-sm']).toBe('4px')
    expect(s['--token-fonts-body']).toBe('Inter, sans-serif')
    expect(s['--token-colors-evil']).toBeUndefined()
  })
  it('finds the token behind a ref', () => {
    expect(findTokenByRef(tokens, 'var(--token-colors-primary)')).toEqual({
      kind: 'colors',
      name: 'primary',
    })
    expect(findTokenByRef(tokens, 'var(--token-colors-nope)')).toBeUndefined()
    expect(findTokenByRef(tokens, '#fff')).toBeUndefined()
    expect(findTokenByRef(tokens, 12)).toBeUndefined()
  })
})
