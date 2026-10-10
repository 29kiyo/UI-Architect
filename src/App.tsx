import { useEffect, useState, useSyncExternalStore } from 'react'
import { useStore } from 'zustand'
import { docStore, history } from '@/appSession'
import { ImportDialog } from '@/io'
import { RunningCommandsPanel } from '@/RunningCommandsPanel'
import { applySettingsToElement, SettingsPanel, useSettings } from '@/settings'
import { logger } from '@/shared'

export default function App() {
  const theme = useSettings((s) => s.theme)
  const language = useSettings((s) => s.language)
  const logLevel = useSettings((s) => s.logLevel)
  const showRunningCommands = useSettings((s) => s.showRunningCommands)
  const doc = useStore(docStore, (s) => s.doc)
  const hist = useSyncExternalStore(history.subscribe, history.getState)
  const [importOpen, setImportOpen] = useState(false)
  const ja = language === 'ja'

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
      <p>
        <button type="button" onClick={() => setImportOpen(true)}>
          {ja ? '取り込み' : 'Import'}
        </button>{' '}
        <button type="button" disabled={!hist.canUndo} onClick={() => history.undo()}>
          Undo{hist.undoName ? ` (${hist.undoName})` : ''}
        </button>{' '}
        <button type="button" disabled={!hist.canRedo} onClick={() => history.redo()}>
          Redo
        </button>{' '}
        <span>
          {Object.keys(doc.pages[0]?.nodes ?? {}).length} {ja ? 'ノード' : 'nodes'}
        </span>
      </p>
      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          history={history}
          devices={doc.devices}
          language={language}
        />
      )}
      <SettingsPanel />
      {showRunningCommands && (
        <RunningCommandsPanel title={language === 'ja' ? '実行ログ' : 'Running commands'} />
      )}
    </>
  )
}
