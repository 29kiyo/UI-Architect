import type { Id, UIDocument } from '../model'

export type Link =
  | { kind: 'none' }
  | { kind: 'page'; pageId: Id }
  | { kind: 'anchor'; nodeId: Id }
  | { kind: 'external'; url: string }
  | { kind: 'raw'; value: string } // 取り込み済みの相対リンクなど。触らない

export const NAV_MODES = ['push', 'replace', 'back'] as const
export type NavMode = (typeof NAV_MODES)[number]
export const NAV_TRANSITIONS = ['none', 'fade', 'slide'] as const
export type NavTransition = (typeof NAV_TRANSITIONS)[number]

const PAGE = 'page:'
const ANCHOR = '#node:'

export function parseLink(href: unknown): Link {
  if (typeof href !== 'string' || href.trim() === '') return { kind: 'none' }
  const s = href.trim()
  if (s.startsWith(PAGE) && s.length > PAGE.length)
    return { kind: 'page', pageId: s.slice(PAGE.length) }
  if (s.startsWith(ANCHOR) && s.length > ANCHOR.length) {
    return { kind: 'anchor', nodeId: s.slice(ANCHOR.length) }
  }
  if (/^https?:\/\//i.test(s)) return { kind: 'external', url: s }
  return { kind: 'raw', value: s }
}

export function formatLink(l: Link): string {
  switch (l.kind) {
    case 'none':
      return ''
    case 'page':
      return PAGE + l.pageId
    case 'anchor':
      return ANCHOR + l.nodeId
    case 'external':
      return l.url
    case 'raw':
      return l.value
  }
}

// 外部 URL として使える文字列か(http / https のみ)
export function isValidExternalUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export const asNavMode = (v: unknown): NavMode =>
  (NAV_MODES as readonly unknown[]).includes(v) ? (v as NavMode) : 'push'
export const asNavTransition = (v: unknown): NavTransition =>
  (NAV_TRANSITIONS as readonly unknown[]).includes(v) ? (v as NavTransition) : 'none'

// リンク先が存在するか(raw / external / none は検査しない)
export function linkTargetExists(
  doc: UIDocument,
  l: Link,
  pageOrMasterNodes: Record<string, unknown>,
): boolean {
  if (l.kind === 'page') return doc.pages.some((p) => p.id === l.pageId)
  if (l.kind === 'anchor') return l.nodeId in pageOrMasterNodes
  return true
}
