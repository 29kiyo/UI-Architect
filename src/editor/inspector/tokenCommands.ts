import type { Command } from '@/core'
import type { TokenKind } from '../canvas/tokenVars'

const cleanName = (name: string): string => {
  const n = name.trim()
  if (n === '') throw new Error('token name is empty')
  return n
}

export function createSetTokenCommand(kind: TokenKind, name: string, value: string): Command {
  return {
    name: 'set token',
    apply: (draft) => {
      draft.tokens[kind][cleanName(name)] = value
    },
  }
}

// 削除しても props 側の参照は残る(UI で「未定義」と表示する)
export function createRemoveTokenCommand(kind: TokenKind, name: string): Command {
  return {
    name: 'remove token',
    apply: (draft) => {
      delete draft.tokens[kind][name]
    },
  }
}
