import { useMemo, useRef, useState } from 'react'
import type { Device, History, ImportInput } from '@/core'
import { BeforeAfter } from './BeforeAfter'
import { fromFiles, fromText, fromUrl } from './input'
import { analyzeInputs, commitPrepared, outlineOf, prepareImport, type Prepared } from './prepare'

type Props = {
  onClose: () => void
  history: History
  devices: Device[]
  language: 'ja' | 'en'
}

type PreviewState = {
  prepared: Prepared
  inputs: ImportInput[]
  importerId: string
  deviceId: string
}

const TEXT = {
  ja: {
    title: '取り込み',
    paste: '貼付(HTML / SVG / TSX など)',
    addPaste: '追加',
    files: 'ファイル(複数可。画像などは参照解決に使います)',
    drop: 'ここにドラッグ&ドロップ',
    url: 'URL(取得できない場合は貼付かファイルで)',
    fetch: '取得',
    inputs: '入力',
    none: '(なし)',
    remove: '削除',
    pasted: '貼付',
    importer: '形式',
    auto: '自動',
    device: '対象デバイス',
    preview: 'プレビュー',
    commit: '確定',
    cancel: '閉じる',
    result: '結果',
    nodes: 'ノード',
    assets: 'アセット',
    warnings: '警告',
    outline: '構造',
    more: '…(以降省略)',
    busy: '処理中…',
    mobile: 'スマホ用も自動生成',
  },
  en: {
    title: 'Import',
    paste: 'Paste (HTML / SVG / TSX ...)',
    addPaste: 'Add',
    files: 'Files (multiple OK; images etc. are used to resolve references)',
    drop: 'Drag & drop here',
    url: 'URL (paste or upload if it cannot be fetched)',
    fetch: 'Fetch',
    inputs: 'Inputs',
    none: '(none)',
    remove: 'Remove',
    pasted: 'pasted',
    importer: 'Format',
    auto: 'Auto',
    device: 'Target device',
    preview: 'Preview',
    commit: 'Import',
    cancel: 'Close',
    result: 'Result',
    nodes: 'nodes',
    assets: 'assets',
    warnings: 'Warnings',
    outline: 'Structure',
    more: '... (truncated)',
    busy: 'Working...',
    mobile: 'Also generate mobile',
  },
} as const

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function ImportDialog({ onClose, history, devices, language }: Props) {
  const t = TEXT[language]
  const [inputs, setInputs] = useState<ImportInput[]>([])
  const [pasteText, setPasteText] = useState('')
  const [url, setUrl] = useState('')
  const [importerId, setImporterId] = useState('')
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? '')
  const [mobileId, setMobileId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const abort = useRef<AbortController | null>(null)

  const width = devices.find((d) => d.id === deviceId)?.width
  const analysis = useMemo(
    () => analyzeInputs(inputs, width !== undefined ? { width } : {}),
    [inputs, width],
  )
  const top = analysis.candidates[0]
  const effectiveId = importerId || (top && top.score > 0 ? top.id : '')
  const fresh =
    preview !== null &&
    preview.inputs === inputs &&
    preview.importerId === effectiveId &&
    preview.deviceId === deviceId
      ? preview
      : null
  const outline = useMemo(() => (fresh ? outlineOf(fresh.prepared.result) : null), [fresh])

  const guard = async (fn: (signal: AbortSignal) => Promise<void>) => {
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    setBusy(true)
    setError(null)
    try {
      await fn(ac.signal)
    } catch (e) {
      if (!ac.signal.aborted) setError(errMsg(e))
    } finally {
      if (abort.current === ac) setBusy(false)
    }
  }

  const close = () => {
    abort.current?.abort()
    onClose()
  }
  const addFiles = (files: Iterable<File>) =>
    guard(async () => {
      const added = await fromFiles(files)
      setInputs((prev) => [...prev, ...added])
    })
  const addUrl = () =>
    guard(async (signal) => {
      const added = await fromUrl(url.trim(), { signal })
      setInputs((prev) => [...prev, added])
      setUrl('')
    })
  const addPaste = () => {
    if (!pasteText.trim()) return
    setInputs((prev) => [...prev, fromText(pasteText)])
    setPasteText('')
  }
  const runPreview = () =>
    guard(async (signal) => {
      const prepared = await prepareImport(inputs, {
        ...(effectiveId ? { importerId: effectiveId } : {}),
        ...(width !== undefined ? { width } : {}),
        ...(deviceId ? { deviceId } : {}),
        signal,
      })
      setPreview({ prepared, inputs, importerId: effectiveId, deviceId })
    })
  const commit = () => {
    if (!fresh) return
    try {
      commitPrepared(history, fresh.prepared, {
        ...(deviceId ? { deviceId } : {}),
        ...(mobileId && mobileId !== deviceId ? { mobileDeviceId: mobileId } : {}),
      })
      onClose()
    } catch (e) {
      setError(errMsg(e))
    }
  }

  const label = (i: ImportInput) =>
    `${i.name ?? t.pasted} (${i.kind}${
      i.data ? `, ${i.data.byteLength} B` : i.text !== undefined ? `, ${i.text.length} chars` : ''
    })`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
      onKeyDown={(e) => e.key === 'Escape' && close()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 'min(760px, 94vw)',
          maxHeight: '90vh',
          overflow: 'auto',
          textAlign: 'left',
          padding: 16,
          background: 'var(--bg, #fff)',
          color: 'inherit',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}
      >
        <h2 style={{ marginTop: 0 }}>{t.title}</h2>

        <section
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void addFiles(Array.from(e.dataTransfer.files))
          }}
        >
          <label>
            {t.paste}
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={5}
              style={{ display: 'block', width: '100%', fontFamily: 'var(--mono)' }}
            />
          </label>
          <button type="button" onClick={addPaste} disabled={!pasteText.trim()}>
            {t.addPaste}
          </button>
          <p>
            <label>
              {t.files}{' '}
              <input
                type="file"
                multiple
                onChange={(e) => {
                  void addFiles(Array.from(e.target.files ?? []))
                  e.target.value = ''
                }}
              />
            </label>
            <br />
            <small>{t.drop}</small>
          </p>
          <p>
            <label>
              {t.url}{' '}
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
              />
            </label>{' '}
            <button type="button" onClick={() => void addUrl()} disabled={!url.trim() || busy}>
              {t.fetch}
            </button>
          </p>
        </section>

        <section>
          <strong>{t.inputs}</strong>
          {inputs.length === 0 && <div>{t.none}</div>}
          <ul>
            {inputs.map((i, n) => (
              <li key={n}>
                {label(i)}{' '}
                <button type="button" onClick={() => setInputs((p) => p.filter((_, k) => k !== n))}>
                  {t.remove}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <label>
            {t.importer}{' '}
            <select value={importerId} onChange={(e) => setImporterId(e.target.value)}>
              <option value="">
                {t.auto}
                {top && top.score > 0 ? ` (${top.label})` : ''}
              </option>
              {analysis.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.score.toFixed(2)})
                </option>
              ))}
            </select>
          </label>{' '}
          <label>
            {t.device}{' '}
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.width}×{d.height})
                </option>
              ))}
            </select>
          </label>{' '}
          <label>
            {t.mobile}{' '}
            <select value={mobileId} onChange={(e) => setMobileId(e.target.value)}>
              <option value="">{t.none}</option>
              {devices
                .filter((d) => d.id !== deviceId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.width}×{d.height})
                  </option>
                ))}
            </select>
          </label>{' '}
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={inputs.length === 0 || busy}
          >
            {t.preview}
          </button>
        </section>

        {busy && <p>{t.busy}</p>}
        {error && (
          <p role="alert" style={{ color: 'crimson' }}>
            {error}
          </p>
        )}

        {fresh && outline && (
          <section>
            <strong>{t.result}</strong>
            <div>
              {fresh.prepared.importerId} / {outline.total} {t.nodes} /{' '}
              {fresh.prepared.result.assets.length} {t.assets}
            </div>
            {fresh.prepared.result.warnings.length > 0 && (
              <>
                <strong>{t.warnings}</strong>
                <ul>
                  {fresh.prepared.result.warnings.map((w, n) => (
                    <li key={n}>{w}</li>
                  ))}
                </ul>
              </>
            )}
            <BeforeAfter
              beforeHtml={fresh.prepared.beforeHtml}
              nodes={fresh.prepared.result.nodes}
              width={width ?? 1280}
              language={language}
            />
            <strong>{t.outline}</strong>
            <div
              style={{ fontFamily: 'var(--mono)', fontSize: 13, maxHeight: 220, overflow: 'auto' }}
            >
              {outline.rows.map((r, n) => (
                <div key={n} style={{ paddingLeft: r.depth * 14 }}>
                  {r.text}
                </div>
              ))}
              {outline.total > outline.rows.length && <div>{t.more}</div>}
            </div>
          </section>
        )}

        <p style={{ textAlign: 'right' }}>
          <button type="button" onClick={commit} disabled={!fresh || busy}>
            {t.commit}
          </button>{' '}
          <button type="button" onClick={close}>
            {t.cancel}
          </button>
        </p>
      </div>
    </div>
  )
}
