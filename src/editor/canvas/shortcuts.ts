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
