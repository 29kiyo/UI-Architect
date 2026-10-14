import type { CSSProperties } from 'react'
import type { Node } from '@/core'

// 描画に使う props グループ(compare.ts の暫定描画と同じ)
const GROUPS = [
  'layout',
  'size',
  'position',
  'appearance',
  'border',
  'radius',
  'shadow',
  'effects',
  'transform',
  'typography',
  'transition',
] as const

const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

// ノードの実効 props → React の style。外部/asset 参照や不正な値は描画しない
// 状態プレビューで重ねない値(ショートハンドは longhand と混ぜると React が警告する)
const STATE_SKIP = new Set([
  'background',
  'border',
  'borderTop',
  'borderRight',
  'borderBottom',
  'borderLeft',
  'borderRadius',
  'margin',
  'padding',
  'font',
  'flex',
  'grid',
  'gap',
  'inset',
  'outline',
  'overflow',
  'textDecoration',
  'transition',
])

// state を渡すと、その状態のスタイル(props.states[state])を重ねる(表示専用)
export function nodeStyle(n: Node, state?: string): CSSProperties {
  const out: Record<string, string | number> = {}
  for (const g of GROUPS) {
    for (const [k, v] of Object.entries(n.props[g])) {
      if (k.startsWith('--')) continue
      if (typeof v === 'number') {
        out[camel(k)] = v
        continue
      }
      if (typeof v !== 'string') continue
      if (/[;{}<>]/.test(v)) continue
      if (/url\(/i.test(v) && !/url\(\s*["']?data:/i.test(v)) continue
      out[camel(k)] = v
    }
  }
  const st = state ? n.props.states[state] : undefined
  if (st && typeof st === 'object' && !Array.isArray(st)) {
    for (const [k, v] of Object.entries(st as Record<string, unknown>)) {
      const key = camel(k)
      if (key.startsWith('--') || STATE_SKIP.has(key)) continue
      if (typeof v === 'number') out[key] = v
      else if (
        typeof v === 'string' &&
        !/[;{}<>]/.test(v) &&
        !(/url\(/i.test(v) && !/url\(\s*["']?data:/i.test(v))
      )
        out[key] = v
    }
  }
  if (n.hidden) out.display = 'none'
  return out as CSSProperties
}
