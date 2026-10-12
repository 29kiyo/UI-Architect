import type { Id } from '@/core'
import { runEditAction, getClipboard, type EditEnv } from './actions'
import { alignEligible } from './align'
import { runAlign, runAutoLayout, type AlignOp } from './alignActions'
import { SHORTCUT_KEYS, type EditAction } from './shortcuts'
import type { Viewport } from './viewport'

export type PaletteCommand = {
  id: string
  label: string
  keys?: string | undefined
  enabled: boolean
  run: () => void
}

type Lang = 'ja' | 'en'

const EDIT: Record<EditAction, { ja: string; en: string }> = {
  undo: { ja: '元に戻す', en: 'Undo' },
  redo: { ja: 'やり直す', en: 'Redo' },
  duplicate: { ja: '複製', en: 'Duplicate' },
  delete: { ja: '削除', en: 'Delete' },
  group: { ja: 'グループ化', en: 'Group' },
  ungroup: { ja: 'グループ解除', en: 'Ungroup' },
  copy: { ja: 'コピー', en: 'Copy' },
  paste: { ja: '貼り付け', en: 'Paste' },
  front: { ja: '最前面へ', en: 'Bring to front' },
  back: { ja: '最背面へ', en: 'Send to back' },
  forward: { ja: '1つ前面へ', en: 'Bring forward' },
  backward: { ja: '1つ背面へ', en: 'Send backward' },
}

const ALIGN: Record<AlignOp, { ja: string; en: string }> = {
  left: { ja: '左揃え', en: 'Align left' },
  hcenter: { ja: '左右中央揃え', en: 'Align center (H)' },
  right: { ja: '右揃え', en: 'Align right' },
  top: { ja: '上揃え', en: 'Align top' },
  vcenter: { ja: '上下中央揃え', en: 'Align center (V)' },
  bottom: { ja: '下揃え', en: 'Align bottom' },
  'distribute-h': { ja: '横に等間隔', en: 'Distribute horizontally' },
  'distribute-v': { ja: '縦に等間隔', en: 'Distribute vertically' },
}

export type BuildArgs = {
  env: EditEnv | undefined
  el: HTMLElement | null
  vp: Viewport
  language: Lang
  selectedIds: readonly Id[]
  deviceId: Id | undefined
  canUndo: boolean
  canRedo: boolean
}

export function buildPaletteCommands(a: BuildArgs): PaletteCommand[] {
  const { env, language: l } = a
  const page = env?.page
  const ids = page ? a.selectedIds.filter((id) => id in page.nodes && id !== page.rootNodeId) : []
  const n = ids.length
  const enabledEdit: Record<EditAction, boolean> = {
    undo: a.canUndo,
    redo: a.canRedo,
    duplicate: n > 0,
    delete: n > 0,
    group: n >= 2,
    ungroup: n === 1,
    copy: n > 0,
    paste: getClipboard() !== undefined,
    front: n > 0,
    back: n > 0,
    forward: n > 0,
    backward: n > 0,
  }
  const out: PaletteCommand[] = (Object.keys(EDIT) as EditAction[]).map((act) => ({
    id: `edit:${act}`,
    label: EDIT[act][l],
    keys: SHORTCUT_KEYS[act],
    enabled: !!env && enabledEdit[act],
    run: () => env && runEditAction(act, env),
  }))
  const canAlign = !!env && !!page && !!a.deviceId && alignEligible(page, a.deviceId, ids)
  for (const op of Object.keys(ALIGN) as AlignOp[]) {
    out.push({
      id: `align:${op}`,
      label: ALIGN[op][l],
      enabled: canAlign && (!op.startsWith('distribute') || n >= 3),
      run: () => env && a.el && runAlign(env, a.el, a.vp, op),
    })
  }
  out.push({
    id: 'auto-layout',
    label: l === 'ja' ? 'オートレイアウト化' : 'Auto layout',
    enabled: !!env && n >= 2,
    run: () => env && a.el && runAutoLayout(env, a.el, a.vp),
  })
  return out
}

// 空白区切りの語がすべて(ラベル+ID に)含まれるものだけ。順序は元のまま
export function filterCommands(list: PaletteCommand[], query: string): PaletteCommand[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return list
  return list.filter((c) => {
    const hay = `${c.label} ${c.id}`.toLowerCase()
    return tokens.every((t) => hay.includes(t))
  })
}
