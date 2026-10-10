import { parse } from '@babel/parser'

// 型に依存しない最小の AST 表現(Babel のバージョン差を吸収する)
export type AstNode = {
  type: string
  start?: number | null
  end?: number | null
  [key: string]: unknown
}

const isNode = (v: unknown): v is AstNode =>
  typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string'

export const child = (n: AstNode | undefined, key: string): AstNode | undefined => {
  const v = n?.[key]
  return isNode(v) ? v : undefined
}
export const list = (n: AstNode | undefined, key: string): AstNode[] => {
  const v = n?.[key]
  return Array.isArray(v) ? v.filter(isNode) : []
}
export const str = (n: AstNode | undefined, key: string): string | undefined => {
  const v = n?.[key]
  return typeof v === 'string' ? v : undefined
}
export const flag = (n: AstNode | undefined, key: string): boolean => n?.[key] === true

export function snippet(code: string, n: AstNode | undefined): string {
  if (!n || typeof n.start !== 'number' || typeof n.end !== 'number') return ''
  const s = code.slice(n.start, n.end).replace(/\s+/g, ' ').trim()
  return s.length > 200 ? `${s.slice(0, 200)}…` : s
}

// リテラルとして確定できる値のみ返す(動的なら undefined)
export function staticValue(n: AstNode | undefined): string | number | boolean | undefined {
  if (!n) return undefined
  switch (n.type) {
    case 'StringLiteral':
      return str(n, 'value')
    case 'NumericLiteral': {
      const v = n['value']
      return typeof v === 'number' ? v : undefined
    }
    case 'BooleanLiteral': {
      const v = n['value']
      return typeof v === 'boolean' ? v : undefined
    }
    case 'TemplateLiteral': {
      if (list(n, 'expressions').length > 0) return undefined
      const v = list(n, 'quasis')[0]?.['value'] as { cooked?: string | null } | undefined
      return v?.cooked ?? undefined
    }
    case 'UnaryExpression': {
      if (str(n, 'operator') !== '-') return undefined
      const a = staticValue(child(n, 'argument'))
      return typeof a === 'number' ? -a : undefined
    }
    default:
      return undefined
  }
}

export type ParseMode = 'tsx' | 'dts'
export type ParsedSource = { program: AstNode; errors: number }

// 構文木にするだけ。コードは実行しない
export function parseSource(code: string, mode: ParseMode): ParsedSource {
  const file = parse(code, {
    sourceType: 'module',
    errorRecovery: true,
    plugins: mode === 'tsx' ? ['jsx', 'typescript'] : ['typescript'],
  })
  const f = file as unknown as { program: AstNode; errors?: unknown[] }
  return { program: f.program, errors: f.errors?.length ?? 0 }
}
