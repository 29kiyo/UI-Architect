import { describe, expect, it } from 'vitest'
import { createEmptyDocument } from '../model'
import {
  asNavMode,
  asNavTransition,
  formatLink,
  isValidExternalUrl,
  linkTargetExists,
  parseLink,
} from './link'

describe('link', () => {
  it('解析と生成が往復する', () => {
    for (const h of ['page:p1', '#node:n1', 'https://example.com/a?b=1', './about.html']) {
      expect(formatLink(parseLink(h))).toBe(h)
    }
    expect(parseLink('page:p1')).toEqual({ kind: 'page', pageId: 'p1' })
    expect(parseLink('#node:n1')).toEqual({ kind: 'anchor', nodeId: 'n1' })
    expect(parseLink('./about.html')).toEqual({ kind: 'raw', value: './about.html' })
    expect(parseLink('')).toEqual({ kind: 'none' })
    expect(parseLink(undefined)).toEqual({ kind: 'none' })
    expect(parseLink('page:')).toEqual({ kind: 'raw', value: 'page:' })
  })

  it('外部 URL は http / https のみ', () => {
    expect(isValidExternalUrl('https://a.com')).toBe(true)
    expect(isValidExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isValidExternalUrl('abc')).toBe(false)
  })

  it('遷移の種類は不正値を既定に丸める', () => {
    expect(asNavMode('replace')).toBe('replace')
    expect(asNavMode('x')).toBe('push')
    expect(asNavTransition('fade')).toBe('fade')
    expect(asNavTransition(1)).toBe('none')
  })

  it('リンク先の存在確認', () => {
    const doc = createEmptyDocument('t')
    const pid = doc.pages[0]!.id
    expect(linkTargetExists(doc, { kind: 'page', pageId: pid }, {})).toBe(true)
    expect(linkTargetExists(doc, { kind: 'page', pageId: 'x' }, {})).toBe(false)
    expect(linkTargetExists(doc, { kind: 'anchor', nodeId: 'n' }, { n: 1 })).toBe(true)
    expect(linkTargetExists(doc, { kind: 'anchor', nodeId: 'm' }, { n: 1 })).toBe(false)
  })
})
