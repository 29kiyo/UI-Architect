import { describe, expect, it } from 'vitest'
import { applySettingsToElement } from './apply'
import { loadSettings, SETTINGS_KEY, type StorageLike } from './storage'
import { createSettingsStore } from './store'
import { DEFAULT_SETTINGS, parseSettings } from './types'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
  data: Record<string, string>
} {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v
    },
  }
}

describe('settings', () => {
  it('保存なしなら既定値', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS)
  })

  it('変更が保存され、再読込で復元される', () => {
    const storage = memoryStorage()
    createSettingsStore(storage).getState().update({ showRunningCommands: true, theme: 'dark' })
    const reloaded = createSettingsStore(storage).getState()
    expect(reloaded.showRunningCommands).toBe(true)
    expect(reloaded.theme).toBe('dark')
  })

  it('未知キーは無視される', () => {
    const s = parseSettings({ theme: 'light', unknownKey: 123 })
    expect(s.theme).toBe('light')
    expect('unknownKey' in s).toBe(false)
  })

  it('欠損は既定値で補完される', () => {
    const s = parseSettings({ language: 'en' })
    expect(s.language).toBe('en')
    expect(s.autosaveIntervalSec).toBe(DEFAULT_SETTINGS.autosaveIntervalSec)
    expect(s.logLevel).toBe(DEFAULT_SETTINGS.logLevel)
  })

  it('不正値は既定値に戻る', () => {
    const s = parseSettings({ theme: 'pink', autosaveIntervalSec: -5, showRunningCommands: 'yes' })
    expect(s.theme).toBe('system')
    expect(s.autosaveIntervalSec).toBe(30)
    expect(s.showRunningCommands).toBe(false)
  })

  it('壊れたJSON・オブジェクト以外でも落ちない', () => {
    expect(loadSettings(memoryStorage({ [SETTINGS_KEY]: '{broken' }))).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings([1, 2])).toEqual(DEFAULT_SETTINGS)
  })

  it('保存内容に関数(update/reset)が含まれない', () => {
    const storage = memoryStorage()
    createSettingsStore(storage).getState().update({ language: 'en' })
    const saved = JSON.parse(storage.data[SETTINGS_KEY])
    expect(saved.language).toBe('en')
    expect('update' in saved).toBe(false)
  })

  it('テーマ・言語を要素に反映する', () => {
    const el = { dataset: {} as DOMStringMap, lang: '' }
    applySettingsToElement(el, { theme: 'dark', language: 'en' })
    expect(el.dataset.theme).toBe('dark')
    expect(el.lang).toBe('en')
    applySettingsToElement(el, { theme: 'system', language: 'ja' })
    expect(el.dataset.theme).toBeUndefined()
    expect(el.lang).toBe('ja')
  })
})
