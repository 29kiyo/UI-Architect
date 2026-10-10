export type Value = string | number | boolean | null | Value[] | { [key: string]: Value }
export type Scope = Record<string, Value>

export type BinOp =
  '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||'

export type Expr =
  | { k: 'lit'; v: Value }
  | { k: 'var'; name: string }
  | { k: 'member'; obj: Expr; prop: string }
  | { k: 'unary'; op: '-' | '!'; arg: Expr }
  | { k: 'bin'; op: BinOp; l: Expr; r: Expr }
  | { k: 'cond'; test: Expr; a: Expr; b: Expr }

export class ExprError extends Error {
  pos: number | undefined
  constructor(message: string, pos?: number) {
    super(message)
    this.name = 'ExprError'
    this.pos = pos
  }
}

const MAX_LENGTH = 2000
const MAX_DEPTH = 64

type Tok = { type: 'num' | 'str' | 'id' | 'op' | 'end'; value: string | number; pos: number }

const TWO_CHAR = ['&&', '||', '==', '!=', '<=', '>=']
const ONE_CHAR = '+-*/%<>!?:().'

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[0-9]/.test(c)) {
      const m = /^\d+(?:\.\d+)?/.exec(src.slice(i)) as RegExpExecArray
      out.push({ type: 'num', value: Number(m[0]), pos: i })
      i += m[0].length
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)) as RegExpExecArray
      out.push({ type: 'id', value: m[0], pos: i })
      i += m[0].length
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      let s = ''
      for (;;) {
        const d = src[j]
        if (d === undefined) throw new ExprError('unterminated string', i)
        if (d === c) break
        if (d === '\\') {
          const e = src[j + 1]
          if (e === undefined) throw new ExprError('unterminated string', i)
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e
          j += 2
        } else {
          s += d
          j++
        }
      }
      out.push({ type: 'str', value: s, pos: i })
      i = j + 1
      continue
    }
    const two = src.slice(i, i + 2)
    if (TWO_CHAR.includes(two)) {
      out.push({ type: 'op', value: two, pos: i })
      i += 2
      continue
    }
    if (ONE_CHAR.includes(c)) {
      out.push({ type: 'op', value: c, pos: i })
      i++
      continue
    }
    throw new ExprError(`unexpected character: ${c}`, i)
  }
  out.push({ type: 'end', value: '', pos: src.length })
  return out
}

// 優先順位の低い順
const LEVELS: string[][] = [
  ['||'],
  ['&&'],
  ['==', '!='],
  ['<', '<=', '>', '>='],
  ['+', '-'],
  ['*', '/', '%'],
]

export function parseExpression(src: string): Expr {
  if (src.length > MAX_LENGTH) throw new ExprError('expression too long')
  const toks = tokenize(src)
  let p = 0
  let depth = 0
  const peek = () => toks[p]
  const isOp = (v: string) => peek().type === 'op' && peek().value === v
  const eat = (v: string) => {
    if (!isOp(v)) return false
    p++
    return true
  }
  const enter = () => {
    if (++depth > MAX_DEPTH) throw new ExprError('expression too deeply nested', peek().pos)
  }
  const leave = () => {
    depth--
  }

  function ternary(): Expr {
    enter()
    let e = binary(0)
    if (eat('?')) {
      const a = ternary()
      if (!eat(':')) throw new ExprError("expected ':'", peek().pos)
      const b = ternary()
      e = { k: 'cond', test: e, a, b }
    }
    leave()
    return e
  }

  function binary(level: number): Expr {
    if (level >= LEVELS.length) return unary()
    let l = binary(level + 1)
    for (;;) {
      const t = peek()
      if (t.type !== 'op' || !LEVELS[level].includes(String(t.value))) return l
      p++
      l = { k: 'bin', op: t.value as BinOp, l, r: binary(level + 1) }
    }
  }

  function unary(): Expr {
    if (isOp('-') || isOp('!')) {
      enter()
      const op = peek().value as '-' | '!'
      p++
      const arg = unary()
      leave()
      return { k: 'unary', op, arg }
    }
    return postfix()
  }

  function postfix(): Expr {
    let e = primary()
    while (eat('.')) {
      const t = peek()
      if (t.type !== 'id') throw new ExprError('property name expected', t.pos)
      p++
      e = { k: 'member', obj: e, prop: String(t.value) }
    }
    return e
  }

  function primary(): Expr {
    const t = peek()
    if (t.type === 'num' || t.type === 'str') {
      p++
      return { k: 'lit', v: t.value }
    }
    if (t.type === 'id') {
      p++
      if (t.value === 'true') return { k: 'lit', v: true }
      if (t.value === 'false') return { k: 'lit', v: false }
      if (t.value === 'null') return { k: 'lit', v: null }
      return { k: 'var', name: String(t.value) }
    }
    if (eat('(')) {
      const e = ternary()
      if (!eat(')')) throw new ExprError("expected ')'", peek().pos)
      return e
    }
    throw new ExprError(
      t.type === 'end' ? 'unexpected end of expression' : `unexpected token: ${t.value}`,
      t.pos,
    )
  }

  const ast = ternary()
  if (peek().type !== 'end') throw new ExprError(`unexpected token: ${peek().value}`, peek().pos)
  return ast
}
