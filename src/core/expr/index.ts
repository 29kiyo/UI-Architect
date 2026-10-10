import { evaluateAst } from './eval'
import { ExprError, parseExpression, type Expr, type Scope, type Value } from './parse'

export { ExprError, parseExpression } from './parse'
export type { Expr, Scope, Value } from './parse'
export { evaluateAst } from './eval'

const cache = new Map<string, Expr>()

function compile(src: string): Expr {
  const hit = cache.get(src)
  if (hit) return hit
  const ast = parseExpression(src)
  if (cache.size >= 500) cache.clear()
  cache.set(src, ast)
  return ast
}

// 失敗時は ExprError を throw
export function evaluate(src: string, scope: Scope = {}): Value {
  return evaluateAst(compile(src), scope)
}

// 構文だけ検証(エディタの入力チェック用)。問題なければ undefined
export function checkExpression(src: string): string | undefined {
  try {
    compile(src)
    return undefined
  } catch (err) {
    return err instanceof ExprError ? err.message : String(err)
  }
}
