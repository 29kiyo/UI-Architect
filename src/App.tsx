import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useStore } from 'zustand'
import { assetUrls, blobStore, docStore, fontLoader, history } from '@/appSession'
import {
  getHomePage,
  openProjectZip,
  putBlobs,
  replaceDocument,
  saveProjectZip,
  findEditablePage,
} from '@/core'
import {
  addFiles,
  addFontFiles,
  AssetPanel,
  AssetUrlsContext,
  BenchButton,
  Canvas,
  Inspector,
  LayerPanel,
  NodesPreview,
  MasterPanel,
  PagePanel,
  Palette,
  selectionStore,
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
  const [pageIdState, setPageId] = useState<string | undefined>(undefined)
  const page = findEditablePage(doc, pageIdState) ?? getHomePage(doc)
  const pageId = page?.id
  const fileRef = useRef<HTMLInputElement>(null)
  const fontRef = useRef<HTMLInputElement>(null)
  // 画像ファイルをアセットとして配置(選択/ドロップ/貼り付け共通)
  // フォントファイルを Asset として追加(登録は doc.assets の同期で行われる)
  const addFonts = (files: File[]) => {
    if (!page || files.length === 0) return
    addFontFiles({ doc, page, history }, files, { blobs: blobStore, urls: assetUrls }).catch(
      (e: unknown) => console.error(e),
    )
  }
  const addImages = (files: File[], at?: FileDropAt) => {
    if (!page || files.length === 0) return
    addFiles({ doc, page, history }, files, { blobs: blobStore, urls: assetUrls }, at).catch(
      (e: unknown) => console.error(e),
    )
  }
  const ja = language === 'ja'

  // プロジェクトを zip で保存 / 開く(従来の JSON も開ける)
  const saveZip = () => {
    saveProjectZip(docStore.getState().doc, blobStore)
      .then((r) => r.warnings.length > 0 && window.alert(r.warnings.join('\n')))
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) console.error(e)
      })
  }
  const openZip = () => {
    openProjectZip()
      .then(async (p) => {
        await putBlobs(blobStore, p.assetData)
        assetUrls.clear()
        replaceDocument(docStore, history, p.doc)
        if (p.warnings.length > 0) window.alert(p.warnings.join('\n'))
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        console.error(e)
        window.alert(e instanceof Error ? e.message : String(e))
      })
  }

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

  // ページ切替・削除・開くで、別ページのノード選択が残らないようにする
  useEffect(() => {
    selectionStore.getState().clear()
  }, [pageId])

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
          accept="image/*,.svg"
          multiple
          hidden
          onChange={(e) => {
            addImages(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />{' '}
        <button type="button" onClick={() => fontRef.current?.click()}>
          {ja ? 'フォントを追加' : 'Add font'}
        </button>
        <input
          ref={fontRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          multiple
          hidden
          onChange={(e) => {
            addFonts(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />{' '}
        <button type="button" onClick={saveZip}>
          {ja ? '保存(zip)' : 'Save (zip)'}
        </button>{' '}
        <button type="button" onClick={openZip}>
          {ja ? '開く' : 'Open'}
        </button>{' '}
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
          {Object.keys(page?.nodes ?? {}).length} {ja ? 'ノード' : 'nodes'}
        </span>
      </p>
      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          history={history}
          devices={doc.devices}
          pageId={pageId}
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
          <PagePanel
            doc={doc}
            history={history}
            pageId={pageId}
            language={language}
            onSelect={setPageId}
          />
          <MasterPanel
            doc={doc}
            history={history}
            pageId={pageId}
            language={language}
            onSelect={setPageId}
          />
          <LayerPanel doc={doc} history={history} pageId={pageId} language={language} />
          <AssetPanel
            doc={doc}
            history={history}
            urls={assetUrls}
            language={language}
            onRemoved={(ids) => {
              for (const id of ids) {
                assetUrls.revoke(id)
                void blobStore.delete(id)
              }
            }}
          />
        </aside>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AssetUrlsContext.Provider value={assetUrls}>
            <Canvas
              key={pageId}
              doc={doc}
              history={history}
              pageId={pageId}
              language={language}
              onFiles={addImages}
            />
          </AssetUrlsContext.Provider>
        </div>
        <aside style={{ width: 300, flexShrink: 0 }}>
          <Inspector
            doc={doc}
            history={history}
            language={language}
            pageId={pageId}
            sinks={{ blobs: blobStore, urls: assetUrls }}
          />
          <StatePanel doc={doc} history={history} pageId={pageId} language={language} />
          <TokenPanel tokens={doc.tokens} history={history} language={language} />
        </aside>
      </div>
      <SettingsPanel />
      {showRunningCommands && <div aria-hidden style={{ height: '32vh' }} />}
      {showRunningCommands && (
        <RunningCommandsPanel title={language === 'ja' ? '実行ログ' : 'Running commands'} />
      )}
    </>
  )
}
