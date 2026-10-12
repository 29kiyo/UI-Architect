export type EditAction =
  | 'undo'
  | 'redo'
  | 'duplicate'
  | 'delete'
  | 'group'
  | 'ungroup'
  | 'copy'
  | 'paste'
  | 'front'
  | 'back'
  | 'forward'
  | 'backward'

export type KeyInput = {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  repeat: boolean
}

// キー入力 → 操作。キー配置に依存しないよう [ ] は code で判定する
export function resolveShortcut(e: KeyInput): EditAction | undefined {
  if (e.repeat || e.altKey) return undefined
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return e.key === 'Delete' || e.key === 'Backspace' ? 'delete' : undefined
  if (e.code === 'BracketRight') return e.shiftKey ? 'front' : 'forward'
  if (e.code === 'BracketLeft') return e.shiftKey ? 'back' : 'backward'
  switch (e.key.toLowerCase()) {
    case 'z':
      return e.shiftKey ? 'redo' : 'undo'
    case 'y':
      return 'redo'
    case 'd':
      return e.shiftKey ? undefined : 'duplicate'
    case 'g':
      return e.shiftKey ? 'ungroup' : 'group'
    case 'c':
      return 'copy'
    case 'v':
      return 'paste'
    default:
      return undefined
  }
}

export const SHORTCUT_KEYS: Record<EditAction, string> = {
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Shift+Z',
  duplicate: 'Ctrl+D',
  delete: 'Delete',
  group: 'Ctrl+G',
  ungroup: 'Ctrl+Shift+G',
  copy: 'Ctrl+C',
  paste: 'Ctrl+V',
  front: 'Ctrl+Shift+]',
  back: 'Ctrl+Shift+[',
  forward: 'Ctrl+]',
  backward: 'Ctrl+[',
}

// 文字入力中・ダイアログ内ではショートカットを効かせない
export function isShortcutBlocked(t: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(t instanceof Element)) return false
  return (
    t.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="dialog"]',
    ) !== null
  )
}

export const isPaletteKey = (
  e: Pick<KeyInput, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
) =>
  (e.ctrlKey || e.metaKey) &&
  !e.altKey &&
  ((e.key.toLowerCase() === 'k' && !e.shiftKey) || (e.key.toLowerCase() === 'p' && e.shiftKey))
