import { describe, expect, it } from 'vitest'
import { ExprError, checkExpression, evaluate, type Scope } from './index'

const ev = (s: string, scope: Scope = {}) => evaluate(s, scope)

describe('expr: 評価', () => {
  it('四則・優先順位・括弧・単項', () => {
    expect(ev('1 + 2 * 3')).toBe(7)
    expect(ev('(1 + 2) * 3')).toBe(9)
    expect(ev('10 % 4 - -2')).toBe(4)
    expect(ev('7 / 2')).toBe(3.5)
  })

  it('文字列: 連結・比較・エスケープ', () => {
    expect(ev("'a' + 'b'")).toBe('ab')
    expect(ev("'n=' + 3")).toBe('n=3')
    expect(ev('"x\\"y"')).toBe('x"y')
    expect(ev("'a' < 'b'")).toBe(true)
  })

  it('比較・論理(短絡)・三項', () => {
    expect(ev('1 < 2 && 2 <= 2')).toBe(true)
    expect(ev('!true || false')).toBe(false)
    expect(ev("null || 'x'")).toBe('x')
    expect(ev('0 && 1')).toBe(0)
    expect(ev("'1' == 1")).toBe(false)
    expect(ev("n > 0 ? 'pos' : 'neg'", { n: 1 })).toBe('pos')
    expect(ev('a ? 1 : b ? 2 : 3', { a: false, b: true })).toBe(2)
    // 短絡: 右辺は評価されない(未定義変数でも throw しない)
    expect(ev('false && missing')).toBe(false)
  })

  it('変数参照とプロパティ', () => {
    const scope: Scope = { user: { name: 'Kiyo', tags: ['a', 'b'] }, n: 2 }
    expect(ev('user.name', scope)).toBe('Kiyo')
    expect(ev('user.tags.length', scope)).toBe(2)
    expect(ev('user.name.length', scope)).toBe(4)
    expect(ev("user.name + '!' + n", scope)).toBe('Kiyo!2')
  })
})

describe('expr: エラーと安全性', () => {
  it('構文エラー・型エラー・未定義は ExprError', () => {
    const bad = [
      '1 +',
      '(1',
      'a(1)',
      '1 2',
      '"abc',
      '@',
      'a.',
      '1 / 0',
      'x',
      '-"a"',
      '1 + true',
      '1 < "a"',
    ]
    for (const s of bad) expect(() => ev(s), s).toThrow(ExprError)
  })

  it('プロトタイプ経由・関数呼び出しは不可', () => {
    const scope: Scope = { o: {} }
    for (const s of [
      'o.constructor',
      'o.__proto__',
      'o.toString',
      'o.hasOwnProperty',
      'constructor',
      'toString',
    ]) {
      expect(() => ev(s, scope), s).toThrow(ExprError)
    }
    expect(() => ev("constructor('return 1')()", scope)).toThrow(ExprError)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('長さと入れ子の上限', () => {
    expect(() => ev('x'.repeat(2001))).toThrow(ExprError)
    expect(() => ev('('.repeat(100) + '1' + ')'.repeat(100))).toThrow(ExprError)
    expect(() => ev('!'.repeat(100) + 'true')).toThrow(ExprError)
    expect(ev('('.repeat(20) + '1' + ')'.repeat(20))).toBe(1)
  })

  it('checkExpression', () => {
    expect(checkExpression('a + 1')).toBeUndefined()
    expect(checkExpression('a +')).toContain('unexpected')
  })
})
