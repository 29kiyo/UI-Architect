import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { getDefaultStorage, loadSettings, saveSettings, type StorageLike } from './storage'
import { DEFAULT_SETTINGS, parseSettings, type Settings } from './types'

export type SettingsState = Settings & {
  update: (patch: Partial<Settings>) => void
  reset: () => void
}

export function createSettingsStore(storage: StorageLike | null) {
  return createStore<SettingsState>((set, get) => {
    const commit = (next: Settings) => {
      set(next)
      saveSettings(storage, next)
    }
    return {
      ...loadSettings(storage),
      // parseSettings が検証と関数プロパティの除去を兼ねる
      update: (patch) => commit(parseSettings({ ...get(), ...patch })),
      reset: () => commit(DEFAULT_SETTINGS),
    }
  })
}

export const settingsStore = createSettingsStore(getDefaultStorage())

export function useSettings<T>(selector: (state: SettingsState) => T): T {
  return useStore(settingsStore, selector)
}
