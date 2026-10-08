import { DEFAULT_SETTINGS, parseSettings, type Settings } from './types'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export const SETTINGS_KEY = 'ui-architect.settings'

export function loadSettings(storage: StorageLike | null): Settings {
  try {
    const text = storage?.getItem(SETTINGS_KEY)
    return parseSettings(text ? JSON.parse(text) : {})
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(storage: StorageLike | null, settings: Settings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* 保存失敗(容量超過・無効化など)は無視する */
  }
}

export function getDefaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
