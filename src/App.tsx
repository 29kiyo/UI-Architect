import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useStore } from 'zustand'
import { assetUrls, blobStore, docStore, fontLoader, history } from '@/appSession'
import { putBlobs } from '@/core'
import {
  addFiles,
  AssetUrlsContext,
  BenchButton,
  Canvas,
  Inspector,
  LayerPanel,
  NodesPreview,
  Palette,
  StatePanel,
  TokenPanel,
  type FileDropAt,
} from '@/editor'
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
  const fileRef = useRef<HTMLInputElement>(null)
  // 画像ファイルをアセットとして配置(選択/ドロップ/貼り付け共通)
  const addImages = (files: File[], at?: FileDropAt) => {
    const page = doc.pages[0]
    if (!page || files.length === 0) return
    addFiles({ doc, page, history }, files, { blobs: blobStore, urls: assetUrls }, at).catch(
      (e: unknown) => console.error(e),
    )
  }
  const ja = language === 'ja'

  useEffect(() => {
    applySettingsToElement(document.documentElement, { theme, language })
  }, [theme, language])

  // ドキュメントのアセットを IndexedDB から読み、描画用 Blob URL にする
  useEffect(() => {
    void assetUrls.loadMany(
      doc.assets.map((a) => a.id),
      blobStore,
    )
    void fontLoader.sync(doc.assets, blobStore)
  }, [doc.assets])

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
        <button type="button" onClick={() => fileRef.current?.click()}>
          {ja ? '画像を追加' : 'Add image'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.svg,.ttf,.otf,.woff,.woff2"
          multiple
          hidden
          onChange={(e) => {
            addImages(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />{' '}
        <button type="button" disabled={!hist.canUndo} onClick={() => history.undo()}>
          Undo{hist.undoName ? ` (${hist.undoName})` : ''}
        </button>{' '}
        <button type="button" disabled={!hist.canRedo} onClick={() => history.redo()}>
          Redo
        </button>{' '}
        {import.meta.env.DEV && (
          <BenchButton
            doc={doc}
            history={history}
            replace={(d) => docStore.getState().replace(d)}
          />
        )}{' '}
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
          onAssetData={async (data) => {
            await putBlobs(blobStore, data)
            for (const [id, b] of data) assetUrls.set(id, b)
          }}
          renderAfter={(nodes, w, h) => <NodesPreview nodes={nodes} width={w} height={h} />}
        />
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <aside style={{ width: 240, flexShrink: 0, textAlign: 'left' }}>
          <Palette language={language} />
          <LayerPanel doc={doc} history={history} language={language} />
        </aside>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AssetUrlsContext.Provider value={assetUrls}>
            <Canvas doc={doc} history={history} language={language} onFiles={addImages} />
          </AssetUrlsContext.Provider>
        </div>
        <aside style={{ width: 300, flexShrink: 0 }}>
          <Inspector
            doc={doc}
            history={history}
            language={language}
            sinks={{ blobs: blobStore, urls: assetUrls }}
          />
          <StatePanel doc={doc} history={history} language={language} />
          <TokenPanel tokens={doc.tokens} history={history} language={language} />
        </aside>
      </div>
      <SettingsPanel />
      {showRunningCommands && (
        <RunningCommandsPanel title={language === 'ja' ? '実行ログ' : 'Running commands'} />
      )}
    </>
  )
}
