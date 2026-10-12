// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isPaletteKey, isShortcutBlocked } from './shortcuts'

describe('isShortcutBlocked', () => {
  it('入力欄・テキストエリア・セレクト・ダイアログ内は true、それ以外は false', () => {
    document.body.innerHTML =
      '<input id="i"><textarea id="t"></textarea><select id="s"></select>' +
      '<div role="dialog"><button id="b"></button></div><div id="d" tabindex="0"></div>'
    const el = (id: string) => document.getElementById(id)
    expect(isShortcutBlocked(el('i'))).toBe(true)
    expect(isShortcutBlocked(el('t'))).toBe(true)
    expect(isShortcutBlocked(el('s'))).toBe(true)
    expect(isShortcutBlocked(el('b'))).toBe(true)
    expect(isShortcutBlocked(el('d'))).toBe(false)
    expect(isShortcutBlocked(document.body)).toBe(false)
    expect(isShortcutBlocked(null)).toBe(false)
  })
})

describe('isPaletteKey', () => {
  const k = (key: string, o = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...o,
  })
  it('Ctrl+K と Ctrl+Shift+P だけ', () => {
    expect(isPaletteKey(k('k', { ctrlKey: true }))).toBe(true)
    expect(isPaletteKey(k('K', { metaKey: true }))).toBe(true)
    expect(isPaletteKey(k('P', { ctrlKey: true, shiftKey: true }))).toBe(true)
    expect(isPaletteKey(k('p', { ctrlKey: true }))).toBe(false)
    expect(isPaletteKey(k('k'))).toBe(false)
    expect(isPaletteKey(k('k', { ctrlKey: true, altKey: true }))).toBe(false)
  })
})
