import type { CSSProperties } from 'react'
import type { Tokens } from '@/core'

export type TokenKind = keyof Tokens
export const TOKEN_KINDS: TokenKind[] = ['colors', 'spacing', 'fonts']

// CSS 変数名に使えない文字は '-' にする
const safe = (name: string) => name.trim().replace(/[^a-zA-Z0-9_-]/g, '-')

export const tokenVarName = (kind: TokenKind, name: string): string =>
  `--token-${kind}-${safe(name)}`

// props に保存する参照文字列
export const tokenRef = (kind: TokenKind, name: string): string =>
  `var(${tokenVarName(kind, name)})`

// style.ts と同じ基準で、スタイル文字列を壊す値は注入しない
const okValue = (v: string) =>
  !/[;{}<>]/.test(v) && !(/url\(/i.test(v) && !/url\(\s*["']?data:/i.test(v))

// アートボードのルートに注入する CSS 変数(トークン変更は再描画なしで全体に効く)
export function tokenStyle(tokens: Tokens): CSSProperties {
  const out: Record<string, string> = {}
  for (const kind of TOKEN_KINDS) {
    for (const [name, value] of Object.entries(tokens[kind])) {
      if (okValue(value)) out[tokenVarName(kind, name)] = value
    }
  }
  return out as CSSProperties
}

// 値がトークン参照ならその (kind, name)。名前は保存済みトークンから逆引きする
export function findTokenByRef(
  tokens: Tokens,
  value: unknown,
): { kind: TokenKind; name: string } | undefined {
  if (typeof value !== 'string') return undefined
  for (const kind of TOKEN_KINDS) {
    for (const name of Object.keys(tokens[kind])) {
      if (tokenRef(kind, name) === value.trim()) return { kind, name }
    }
  }
  return undefined
}
