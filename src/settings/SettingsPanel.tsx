import { useSettings } from './store'
import type { Settings } from './types'

const TEXT = {
  ja: {
    title: '設定',
    showRunningCommands: '実行中コマンドを表示',
    theme: 'テーマ',
    language: '言語',
    themes: { system: 'システム', light: 'ライト', dark: 'ダーク' },
  },
  en: {
    title: 'Settings',
    showRunningCommands: 'Show running commands',
    theme: 'Theme',
    language: 'Language',
    themes: { system: 'System', light: 'Light', dark: 'Dark' },
  },
} as const

export function SettingsPanel() {
  const show = useSettings((s) => s.showRunningCommands)
  const theme = useSettings((s) => s.theme)
  const language = useSettings((s) => s.language)
  const update = useSettings((s) => s.update)
  const t = TEXT[language]

  return (
    <section aria-label={t.title} style={{ textAlign: 'left', padding: 16 }}>
      <h2>{t.title}</h2>
      <p>
        <label>
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => update({ showRunningCommands: e.target.checked })}
          />{' '}
          {t.showRunningCommands}
        </label>
      </p>
      <p>
        <label>
          {t.theme}{' '}
          <select
            value={theme}
            onChange={(e) => update({ theme: e.target.value as Settings['theme'] })}
          >
            {(['system', 'light', 'dark'] as const).map((v) => (
              <option key={v} value={v}>
                {t.themes[v]}
              </option>
            ))}
          </select>
        </label>
      </p>
      <p>
        <label>
          {t.language}{' '}
          <select
            value={language}
            onChange={(e) => update({ language: e.target.value as Settings['language'] })}
          >
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </label>
      </p>
    </section>
  )
}
