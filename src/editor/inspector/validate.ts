import { FORBIDDEN, normalizeInput } from './commit'
import type { PropDef } from './registry'
import { parseLength } from './values'

export type Invalid = 'empty' | 'forbidden' | 'nan'
export type Validation =
  { ok: true; value: string | number; clamped: boolean } | { ok: false; reason: Invalid }

const TEXT_FREE = new Set(['content', 'custom'])

const outOfRange = (n: number, def: PropDef): boolean =>
  (def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)

// normalizeInput と同じ判定に「理由」と「丸めたか」を足したもの
export function validateInput(def: PropDef, raw: string): Validation {
  if (def.type === 'text' && TEXT_FREE.has(def.group))
    return { ok: true, value: raw, clamped: false }
  const s = raw.trim()
  if (def.type !== 'text' && s === '') return { ok: false, reason: 'empty' }
  if (FORBIDDEN.test(s)) return { ok: false, reason: 'forbidden' }
  if (def.type === 'number' && !Number.isFinite(Number(s))) return { ok: false, reason: 'nan' }
  const value = normalizeInput(def, raw)
  if (value === undefined) return { ok: false, reason: 'empty' }
  let clamped = false
  if (def.type === 'number') clamped = outOfRange(Number(s), def)
  if (def.type === 'length') {
    const p = parseLength(s)
    clamped = !!p && 'value' in p && outOfRange(p.value, def)
  }
  return { ok: true, value, clamped }
}

const MSG = {
  ja: {
    empty: '値を入力してください',
    forbidden: '使えない文字( ; { } < > )が含まれています',
    nan: '数値を入力してください',
    clamped: (min?: number, max?: number) => `範囲内に丸めました(${min ?? '-∞'}〜${max ?? '∞'})`,
  },
  en: {
    empty: 'Enter a value',
    forbidden: 'Contains characters that are not allowed ( ; { } < > )',
    nan: 'Enter a number',
    clamped: (min?: number, max?: number) => `Clamped to range (${min ?? '-∞'} to ${max ?? '∞'})`,
  },
} as const

export function validationMessage(
  v: Validation,
  def: PropDef,
  language: 'ja' | 'en',
): string | undefined {
  if (!v.ok) return MSG[language][v.reason]
  return v.clamped ? MSG[language].clamped(def.min, def.max) : undefined
}
