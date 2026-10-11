import { describe, expect, it } from 'vitest'
import { resolveShortcut, type KeyInput } from './shortcuts'

const k = (key: string, o: Partial<KeyInput> = {}): KeyInput => ({
  key,
  code: '',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  repeat: false,
  ...o,
})
const ctrl = { ctrlKey: true }

describe('resolveShortcut', () => {
  it('Undo / Redo', () => {
    expect(resolveShortcut(k('z', ctrl))).toBe('undo')
    expect(resolveShortcut(k('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo')
    expect(resolveShortcut(k('y', { metaKey: true }))).toBe('redo')
  })

  it('複製 / グループ / 解除 / コピー / 貼り付け', () => {
    expect(resolveShortcut(k('d', ctrl))).toBe('duplicate')
    expect(resolveShortcut(k('g', ctrl))).toBe('group')
    expect(resolveShortcut(k('G', { ctrlKey: true, shiftKey: true }))).toBe('ungroup')
    expect(resolveShortcut(k('c', ctrl))).toBe('copy')
    expect(resolveShortcut(k('v', ctrl))).toBe('paste')
  })

  it('削除は修飾キーなし', () => {
    expect(resolveShortcut(k('Delete'))).toBe('delete')
    expect(resolveShortcut(k('Backspace'))).toBe('delete')
    expect(resolveShortcut(k('d'))).toBeUndefined()
  })

  it('z 順は code で判定し、Shift で最前面/最背面', () => {
    expect(resolveShortcut(k(']', { code: 'BracketRight', ctrlKey: true }))).toBe('forward')
    expect(resolveShortcut(k('}', { code: 'BracketRight', ctrlKey: true, shiftKey: true }))).toBe(
      'front',
    )
    expect(resolveShortcut(k('[', { code: 'BracketLeft', ctrlKey: true }))).toBe('backward')
    expect(resolveShortcut(k('{', { code: 'BracketLeft', ctrlKey: true, shiftKey: true }))).toBe(
      'back',
    )
  })

  it('キーリピートと Alt 併用は無視、未割当は undefined', () => {
    expect(resolveShortcut(k('d', { ctrlKey: true, repeat: true }))).toBeUndefined()
    expect(resolveShortcut(k('d', { ctrlKey: true, altKey: true }))).toBeUndefined()
    expect(resolveShortcut(k('a', ctrl))).toBeUndefined()
  })
})
