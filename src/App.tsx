import { useEffect } from 'react'
import { RunningCommandsPanel } from '@/RunningCommandsPanel'
import { applySettingsToElement, SettingsPanel, useSettings } from '@/settings'
import { logger } from '@/shared'

export default function App() {
  const theme = useSettings((s) => s.theme)
  const language = useSettings((s) => s.language)
  const logLevel = useSettings((s) => s.logLevel)
  const showRunningCommands = useSettings((s) => s.showRunningCommands)

  useEffect(() => {
    applySettingsToElement(document.documentElement, { theme, language })
  }, [theme, language])

  useEffect(() => {
    logger.setLevel(logLevel)
  }, [logLevel])

  // 動作確認用: 起動時に1件 task を記録する
  useEffect(() => {
    logger.startTask('app:start').done()
  }, [])

  return (
    <>
      <h1>UI-Architect</h1>
      <SettingsPanel />
      {showRunningCommands && (
        <RunningCommandsPanel title={language === 'ja' ? '実行ログ' : 'Running commands'} />
      )}
    </>
  )
}
