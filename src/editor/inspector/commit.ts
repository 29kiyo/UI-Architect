import type { PropDef } from './registry'
import { fmtNum, formatLength, parseLength } from './values'

// 描画グループ(CSS になる値)では、スタイル文字列を壊す文字を拒否する(style.ts と同じ基準)
const FORBIDDEN = /[;{}<>]/
const TEXT_GROUPS = new Set(['content', 'custom'])
// 単位なしの数値がそのまま意味を持つキー(px を付けると意味が変わる)
const UNITLESS_OK = new Set(['lineHeight'])

const clamp = (n: number, def: PropDef): number => {
  let x = n
  if (def.min !== undefined) x = Math.max(def.min, x)
  if (def.max !== undefined) x = Math.min(def.max, x)
  return x
}

// 入力欄の文字列 → 保存する値。不正なら undefined(呼び出し側は元の値に戻す)
export function normalizeInput(def: PropDef, raw: string): string | number | undefined {
  if (def.type === 'text') {
    if (TEXT_GROUPS.has(def.group)) return raw
    const s = raw.trim()
    return FORBIDDEN.test(s) ? undefined : s
  }
  const s = raw.trim()
  if (s === '' || FORBIDDEN.test(s)) return undefined
  if (def.type === 'number') {
    const n = Number(s)
    return Number.isFinite(n) ? clamp(n, def) : undefined
  }
  if (def.type === 'length') {
    const p = parseLength(s)
    if (!p) return s // calc() / var() などはそのまま通す
    if ('keyword' in p) return p.keyword
    const value = clamp(p.value, def)
    if (p.unit === '') {
      return UNITLESS_OK.has(def.key) ? fmtNum(value) : formatLength({ value, unit: 'px' })
    }
    return formatLength({ value, unit: p.unit })
  }
  return s // select / color / boolean
}
