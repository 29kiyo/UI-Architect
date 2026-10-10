import { ExprError, type Expr, type Scope, type Value } from './parse'

function toStr(v: Value): string {
  return typeof v === 'string'
    ? v
    : typeof v === 'object' && v !== null
      ? JSON.stringify(v)
      : String(v)
}

function member(o: Value, prop: string): Value {
  if (prop === 'length' && (typeof o === 'string' || Array.isArray(o))) return o.length
  // own property のみ。constructor / __proto__ / toString 等のプロトタイプ経由は読めない
  if (o !== null && typeof o === 'object' && !Array.isArray(o) && Object.hasOwn(o, prop)) {
    return o[prop]
  }
  throw new ExprError(`cannot read property: ${prop}`)
}

function num(v: Value, op: string): number {
  if (typeof v !== 'number') throw new ExprError(`'${op}' requires numbers`)
  return v
}

function finite(n: number): number {
  if (!Number.isFinite(n)) throw new ExprError('result is not a finite number')
  return n
}

export function evaluateAst(e: Expr, scope: Scope): Value {
  switch (e.k) {
    case 'lit':
      return e.v
    case 'var':
      if (!Object.hasOwn(scope, e.name)) throw new ExprError(`unknown variable: ${e.name}`)
      return scope[e.name]
    case 'member':
      return member(evaluateAst(e.obj, scope), e.prop)
    case 'unary': {
      const v = evaluateAst(e.arg, scope)
      return e.op === '!' ? !v : -num(v, '-')
    }
    case 'cond':
      return evaluateAst(e.test, scope) ? evaluateAst(e.a, scope) : evaluateAst(e.b, scope)
    case 'bin': {
      if (e.op === '&&') {
        const l = evaluateAst(e.l, scope)
        return l ? evaluateAst(e.r, scope) : l
      }
      if (e.op === '||') {
        const l = evaluateAst(e.l, scope)
        return l ? l : evaluateAst(e.r, scope)
      }
      const l = evaluateAst(e.l, scope)
      const r = evaluateAst(e.r, scope)
      switch (e.op) {
        case '+':
          if (typeof l === 'string' || typeof r === 'string') return toStr(l) + toStr(r)
          return finite(num(l, '+') + num(r, '+'))
        case '-':
          return finite(num(l, '-') - num(r, '-'))
        case '*':
          return finite(num(l, '*') * num(r, '*'))
        case '/':
        case '%': {
          const a = num(l, e.op)
          const b = num(r, e.op)
          if (b === 0) throw new ExprError('division by zero')
          return finite(e.op === '/' ? a / b : a % b)
        }
        case '==':
          return l === r
        case '!=':
          return l !== r
        default: {
          // < <= > >=
          if (!(
            (typeof l === 'number' && typeof r === 'number') ||
            (typeof l === 'string' && typeof r === 'string')
          )) {
            throw new ExprError(`'${e.op}' requires two numbers or two strings`)
          }
          return e.op === '<' ? l < r : e.op === '<=' ? l <= r : e.op === '>' ? l > r : l >= r
        }
      }
    }
  }
}
