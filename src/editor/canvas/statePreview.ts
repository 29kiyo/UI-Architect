import { createStore } from 'zustand/vanilla'
import type { Id } from '@/core'

// 状態(hover 等)のスタイルを選択ノードに一時的に重ねて見るための表示専用ストア(保存・Undo の対象外)
type PreviewState = { state: string | undefined; ids: ReadonlySet<Id> }

export const statePreview = createStore<PreviewState>(() => ({
  state: undefined,
  ids: new Set<Id>(),
}))

export const setStatePreview = (state: string | undefined, ids: Id[]): void =>
  statePreview.setState({ state, ids: new Set(ids) })

// そのノードに重ねる状態名(対象外は undefined)
export function previewStateFor(id: Id): string | undefined {
  const s = statePreview.getState()
  return s.state && s.ids.has(id) ? s.state : undefined
}
