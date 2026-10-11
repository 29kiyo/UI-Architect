import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { Id } from '@/core'

export type Hover = { id: Id; deviceId: Id }

export type SelectionState = {
  selectedIds: Id[]
  activeDeviceId: Id | undefined
  hover: Hover | null
  // additive: Shift 追加(同じデバイス内のみ。別デバイスなら置き換え)
  pick: (id: Id, deviceId: Id, additive: boolean) => void
  pickMany: (ids: Id[], deviceId: Id, additive: boolean) => void
  clear: () => void
  setHover: (h: Hover | null) => void
  // ドキュメント変更(Undo 等)で消えたノードを選択から外す
  prune: (exists: (id: Id) => boolean) => void
}

// 選択状態はドキュメント・履歴とは別(Undo の対象外)
export function createSelectionStore() {
  return createStore<SelectionState>((set) => ({
    selectedIds: [],
    activeDeviceId: undefined,
    hover: null,
    pick: (id, deviceId, additive) =>
      set((s) => {
        if (additive && s.activeDeviceId === deviceId) {
          const has = s.selectedIds.includes(id)
          return {
            selectedIds: has ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id],
          }
        }
        return { selectedIds: [id], activeDeviceId: deviceId }
      }),
    pickMany: (ids, deviceId, additive) =>
      set((s) => {
        if (additive && s.activeDeviceId === deviceId) {
          const merged = [...s.selectedIds, ...ids.filter((id) => !s.selectedIds.includes(id))]
          return merged.length === s.selectedIds.length ? s : { selectedIds: merged }
        }
        if (additive) return s
        return { selectedIds: ids, activeDeviceId: ids.length > 0 ? deviceId : s.activeDeviceId }
      }),
    clear: () => set((s) => (s.selectedIds.length === 0 ? s : { selectedIds: [] })),
    setHover: (h) =>
      set((s) => {
        const a = s.hover
        if (a === h || (a && h && a.id === h.id && a.deviceId === h.deviceId)) return s
        return { hover: h }
      }),
    prune: (exists) =>
      set((s) => {
        const next = s.selectedIds.filter(exists)
        return next.length === s.selectedIds.length ? s : { selectedIds: next }
      }),
  }))
}

export const selectionStore = createSelectionStore()

export function useSelection<T>(selector: (state: SelectionState) => T): T {
  return useStore(selectionStore, selector)
}
