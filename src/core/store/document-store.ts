import {
  applyPatches as immerApplyPatches,
  enablePatches,
  produceWithPatches,
  type Draft,
  type Patch,
} from 'immer'
import { createStore } from 'zustand/vanilla'
import type { UIDocument } from '../model'

enablePatches()

export type UpdateResult = { patches: Patch[]; inversePatches: Patch[] }

export type DocumentState = {
  doc: UIDocument
  // immer の recipe で不変更新し、patches / inversePatches を返す(2-C の Command が使う)
  update: (recipe: (draft: Draft<UIDocument>) => void) => UpdateResult
  // ドキュメント全体の差し替え(読込・復旧用。履歴は呼び出し側で扱う)
  replace: (doc: UIDocument) => void
  // patches を順に適用する(Undo/Redo 用)
  applyPatches: (patches: Patch[]) => void
}

export function createDocumentStore(initial: UIDocument) {
  return createStore<DocumentState>((set, get) => ({
    doc: initial,
    update: (recipe) => {
      const [next, patches, inversePatches] = produceWithPatches(get().doc, recipe)
      if (patches.length > 0) set({ doc: next })
      return { patches, inversePatches }
    },
    replace: (doc) => set({ doc }),
    applyPatches: (patches) => {
      if (patches.length > 0) set({ doc: immerApplyPatches(get().doc, patches) })
    },
  }))
}

export type DocumentStore = ReturnType<typeof createDocumentStore>
