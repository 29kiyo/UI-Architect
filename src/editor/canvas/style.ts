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
export function nodeStyle(n: Node): CSSProperties {
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
  if (n.hidden) out.display = 'none'
  return out as CSSProperties
}
