import { useEffect } from 'react'
import type { History, Page, UIDocument } from '@/core'
import { runEditAction } from './actions'
import { imageFilesOf } from './imageActions'
import { isPaletteKey, isShortcutBlocked, resolveShortcut } from './shortcuts'

// window レベルで編集ショートカットとパレット起動キーを受ける。
// 貼り付けは keydown ではなく paste イベントで受ける(クリップボードの画像を扱うため)
export function useEditorShortcuts(
  doc: UIDocument,
  page: Page | undefined,
  history: History,
  openPalette: () => void,
  onFiles?: ((files: File[]) => void) | undefined,
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
      if (act === 'paste') return // paste イベントで処理する
      if (act && page) {
        e.preventDefault()
        runEditAction(act, { doc, page, history })
      }
    }
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || isShortcutBlocked(e.target) || !page) return
      const files = imageFilesOf(e.clipboardData)
      e.preventDefault()
      if (files.length > 0 && onFiles) onFiles(files)
      else runEditAction('paste', { doc, page, history })
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  }, [doc, page, history, openPalette, onFiles])
}
