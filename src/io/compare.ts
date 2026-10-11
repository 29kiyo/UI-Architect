import type { Node } from '@/core'

// Before/After 比較用の暫定描画(Phase 5 のキャンバスができたら置き換える)
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

const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const MAX_DEPTH = 200

// 本文 HTML を、外部通信なしの文書に包む(render.ts と同じ前提)
export function wrapHtml(body: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    `<style>html,body{margin:0}</style></head><body>${body}</body></html>`
  )
}

function styleOf(n: Node): string {
  const out: string[] = []
  for (const g of GROUPS) {
    for (const [k, v] of Object.entries(n.props[g])) {
      if (typeof v !== 'string' && typeof v !== 'number') continue
      const s = String(v)
      if (/[;{}<>]/.test(s)) continue
      if (/url\(/i.test(s) && !/url\(\s*["']?data:/i.test(s)) continue // 外部/asset 参照は描画しない
      out.push(`${kebab(k)}:${s}`)
    }
  }
  if (n.hidden) out.push('display:none')
  return esc(out.join(';'))
}

export function renderNodesHtml(nodes: Node[]): string {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const render = (n: Node, depth: number): string => {
    if (depth > MAX_DEPTH) return ''
    const style = styleOf(n)
    const c = n.props.content
    if (n.type === 'text') {
      return `<span style="${style}">${esc(String(c.text ?? ''))}</span>`
    }
    if (n.type === 'image') {
      const src = typeof c.src === 'string' && c.src.startsWith('data:') ? c.src : ''
      return src
        ? `<img src="${esc(src)}" alt="${esc(String(c.alt ?? ''))}" style="${style}">`
        : `<div style="${style};background:#e5e5e5"></div>`
    }
    if (n.type === 'svg') {
      return `<div style="${style}">${typeof c.svg === 'string' ? c.svg : ''}</div>`
    }
    const text = typeof c.text === 'string' ? esc(c.text) : ''
    const kids = n.children
      .map((id) => byId.get(id))
      .filter((k): k is Node => k !== undefined)
      .map((k) => render(k, depth + 1))
      .join('')
    return `<div style="${style}">${text}${kids}</div>`
  }
  const root = nodes[0]
  return root ? wrapHtml(render(root, 0)) : wrapHtml('')
}
