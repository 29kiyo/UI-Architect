import { useMemo, useState } from 'react'
import {
  assetRows,
  createRemoveAssetsCommand,
  createReplaceAssetCommand,
  removableAssetIds,
  type Asset,
  type AssetUrlStore,
  type History,
  type UIDocument,
} from '@/core'
import { useSyncExternalStore } from 'react'

type Props = {
  doc: UIDocument
  history: History
  urls: AssetUrlStore
  language: 'ja' | 'en'
  // 削除したアセットのバイナリ(IndexedDB / Blob URL)を片付ける
  onRemoved?: ((ids: string[]) => void) | undefined
}

const TEXT = {
  ja: {
    title: 'アセット',
    search: '検索(名前)',
    all: 'すべて',
    unused: '未使用のみ',
    empty: '(アセットなし)',
    used: (n: number) => `使用 ${n} 箇所`,
    none: '未使用',
    replace: '置換先',
    replaceBtn: '置換',
    remove: '削除',
    removeUnused: '未使用をすべて削除',
    confirm: (n: number) =>
      `${n} 件のアセットを削除します(Undo で戻せますが、保存済みデータは失われます)。よろしいですか?`,
    blocked: '使用中のアセットは削除できません',
    kinds: {
      image: '画像',
      svg: 'SVG',
      font: 'フォント',
      video: '動画',
      audio: '音声',
      other: 'その他',
    },
  },
  en: {
    title: 'Assets',
    search: 'Search (name)',
    all: 'All',
    unused: 'Unused only',
    empty: '(no assets)',
    used: (n: number) => `${n} use(s)`,
    none: 'Unused',
    replace: 'Replace with',
    replaceBtn: 'Replace',
    remove: 'Delete',
    removeUnused: 'Delete all unused',
    confirm: (n: number) =>
      `Delete ${n} asset(s)? (Undo restores the entry, but saved data is lost.)`,
    blocked: 'Assets in use cannot be deleted',
    kinds: {
      image: 'Image',
      svg: 'SVG',
      font: 'Font',
      video: 'Video',
      audio: 'Audio',
      other: 'Other',
    },
  },
} as const

const fmtSize = (n: number) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`

export function AssetPanel({ doc, history, urls, language, onRemoved }: Props) {
  const t = TEXT[language]
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<Asset['kind'] | 'all'>('all')
  const [unusedOnly, setUnusedOnly] = useState(false)
  const [target, setTarget] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | undefined>(undefined)
  // サムネ用 Blob URL の読み込み完了で再描画
  useSyncExternalStore(urls.subscribe, urls.version)
  const rows = useMemo(
    () => assetRows(doc, { query, kind, unusedOnly }),
    [doc, query, kind, unusedOnly],
  )

  const remove = (ids: string[]) => {
    const ok = removableAssetIds(doc, ids)
    if (ok.length === 0) {
      setMsg(t.blocked)
      return
    }
    if (!window.confirm(t.confirm(ok.length))) return
    setMsg(undefined)
    history.execute(createRemoveAssetsCommand(ok))
    onRemoved?.(ok)
  }
  const replace = (fromId: string) => {
    const toId = target[fromId]
    if (!toId) return
    try {
      history.execute(createReplaceAssetCommand(fromId, toId))
      setMsg(undefined)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section aria-label={t.title} style={{ textAlign: 'left', fontSize: 12 }}>
      <h3 style={{ margin: '4px 0' }}>
        {t.title} ({doc.assets.length})
      </h3>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <input
          placeholder={t.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 0, fontSize: 12 }}
        />
        <select value={kind} onChange={(e) => setKind(e.target.value as Asset['kind'] | 'all')}>
          <option value="all">{t.all}</option>
          {(Object.keys(t.kinds) as Asset['kind'][]).map((k) => (
            <option key={k} value={k}>
              {t.kinds[k]}
            </option>
          ))}
        </select>
      </div>
      <label>
        <input
          type="checkbox"
          checked={unusedOnly}
          onChange={(e) => setUnusedOnly(e.target.checked)}
        />{' '}
        {t.unused}
      </label>{' '}
      <button
        type="button"
        onClick={() =>
          remove(
            assetRows(doc)
              .filter((r) => r.unused)
              .map((r) => r.asset.id),
          )
        }
      >
        {t.removeUnused}
      </button>
      {msg && (
        <div role="alert" style={{ color: '#d33' }}>
          {msg}
        </div>
      )}
      <div
        style={{
          maxHeight: 320,
          overflow: 'auto',
          border: '1px solid var(--border)',
          marginTop: 4,
        }}
      >
        {rows.length === 0 && <div style={{ padding: 4 }}>{t.empty}</div>}
        {rows.map((r) => {
          const a = r.asset
          const thumb = a.kind === 'image' ? urls.get(a.id) : undefined
          const same = doc.assets.filter((x) => x.kind === a.kind && x.id !== a.id)
          return (
            <div
              key={a.id}
              style={{
                display: 'flex',
                gap: 6,
                padding: 4,
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  background: 'rgba(128,128,128,0.2)',
                }}
              >
                {thumb && (
                  <img src={thumb} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={a.name}
                >
                  {a.name}
                </div>
                <small>
                  {t.kinds[a.kind]} / {fmtSize(a.size)}
                  {a.width && a.height ? ` / ${a.width}×${a.height}` : ''} /{' '}
                  <strong style={{ color: r.unused ? '#c80' : undefined }}>
                    {r.unused ? t.none : t.used(r.usageCount)}
                  </strong>
                </small>
                {r.warnings.map((w) => (
                  <div key={w.code + w.message} style={{ color: '#c80', fontSize: 11 }}>
                    ⚠ {w.message}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {same.length > 0 && (
                    <>
                      <select
                        aria-label={t.replace}
                        value={target[a.id] ?? ''}
                        style={{ maxWidth: 110, fontSize: 11 }}
                        onChange={(e) => setTarget({ ...target, [a.id]: e.target.value })}
                      >
                        <option value="">{t.replace}…</option>
                        {same.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                      <button type="button" disabled={!target[a.id]} onClick={() => replace(a.id)}>
                        {t.replaceBtn}
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => remove([a.id])}>
                    {t.remove}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
