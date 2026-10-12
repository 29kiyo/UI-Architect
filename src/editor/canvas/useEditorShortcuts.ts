import { useEffect } from 'react'
import type { History, Page, UIDocument } from '@/core'
import { runEditAction } from './actions'
import { isPaletteKey, isShortcutBlocked, resolveShortcut } from './shortcuts'

// window レベルで編集ショートカットとパレット起動キーを受ける
export function useEditorShortcuts(
  doc: UIDocument,
  page: Page | undefined,
  history: History,
  openPalette: () => void,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || isShortcutBlocked(e.target)) return
      if (isPaletteKey(e)) {
        e.preventDefault()
        openPalette()
        return
      }
      const act = resolveShortcut(e)
      if (act && page) {
        e.preventDefault()
        runEditAction(act, { doc, page, history })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, page, history, openPalette])
}
