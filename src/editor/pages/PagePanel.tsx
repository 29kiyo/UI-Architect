import {
  canRemovePage,
  createAddPageCommand,
  createMovePageCommand,
  createPageFor,
  createRemovePageCommand,
  createRenamePageCommand,
  createSetHomePageCommand,
  createSetRouteCommand,
  duplicatePage,
  getHomePage,
  normalizeRoute,
  validateRoute,
  type History,
  type UIDocument,
} from '@/core'
import { useState } from 'react'

type Props = {
  doc: UIDocument
  history: History
  pageId: string | undefined
  language: 'ja' | 'en'
  onSelect: (id: string) => void
}

const TEXT = {
  ja: {
    title: 'ページ',
    add: '追加',
    dup: '複製',
    del: '削除',
    up: '上へ',
    down: '下へ',
    name: '名前',
    route: 'ルート',
    home: 'ホームに設定',
    isHome: 'ホーム',
    confirm: 'このページを削除しますか?(Undo で戻せます)',
    invalid: 'ルートに使えない文字があります',
    duplicate: 'そのルートは他のページで使われています',
  },
  en: {
    title: 'Pages',
    add: 'Add',
    dup: 'Duplicate',
    del: 'Delete',
    up: 'Up',
    down: 'Down',
    name: 'Name',
    route: 'Route',
    home: 'Set as home',
    isHome: 'Home',
    confirm: 'Delete this page? (can be undone)',
    invalid: 'Route contains invalid characters',
    duplicate: 'This route is used by another page',
  },
}

export function PagePanel({ doc, history, pageId, language, onSelect }: Props) {
  const t = TEXT[language]
  const [error, setError] = useState('')
  const home = getHomePage(doc)
  const idx = doc.pages.findIndex((p) => p.id === pageId)
  const cur = doc.pages[idx]

  const add = () => {
    const p = createPageFor(doc)
    history.execute(createAddPageCommand(p))
    onSelect(p.id)
  }
  const dup = () => {
    if (!cur) return
    const p = duplicatePage(doc, cur.id)
    history.execute(createAddPageCommand(p, idx + 1))
    onSelect(p.id)
  }
  const remove = () => {
    if (!cur || !canRemovePage(doc) || !window.confirm(t.confirm)) return
    history.execute(createRemovePageCommand(cur.id))
  }
  const commitName = (el: HTMLInputElement) => {
    if (!cur) return
    const v = el.value.trim()
    if (!v) el.value = cur.name
    else if (v !== cur.name) history.execute(createRenamePageCommand(cur.id, v))
  }
  const commitRoute = (el: HTMLInputElement) => {
    if (!cur) return
    const err = validateRoute(doc, cur.id, el.value)
    if (err) {
      setError(t[err])
      el.value = cur.route
      return
    }
    setError('')
    if (normalizeRoute(el.value) !== cur.route) {
      history.execute(createSetRouteCommand(cur.id, el.value))
    }
  }
  const enterBlur = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  return (
    <section style={{ textAlign: 'left', marginBottom: 8 }}>
      <h3 style={{ margin: '4px 0' }}>{t.title}</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {doc.pages.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              style={{ fontWeight: p.id === pageId ? 'bold' : 'normal', width: '100%' }}
            >
              {home?.id === p.id ? '★ ' : ''}
              {p.name} <small>{p.route}</small>
            </button>
          </li>
        ))}
      </ul>
      <div>
        <button type="button" onClick={add}>
          {t.add}
        </button>{' '}
        <button type="button" disabled={!cur} onClick={dup}>
          {t.dup}
        </button>{' '}
        <button type="button" disabled={!cur || !canRemovePage(doc)} onClick={remove}>
          {t.del}
        </button>
      </div>
      {cur && (
        <div>
          <button
            type="button"
            disabled={idx <= 0}
            onClick={() => history.execute(createMovePageCommand(cur.id, idx - 1))}
          >
            {t.up}
          </button>{' '}
          <button
            type="button"
            disabled={idx >= doc.pages.length - 1}
            onClick={() => history.execute(createMovePageCommand(cur.id, idx + 1))}
          >
            {t.down}
          </button>{' '}
          <button
            type="button"
            disabled={home?.id === cur.id}
            onClick={() => history.execute(createSetHomePageCommand(cur.id))}
          >
            {home?.id === cur.id ? t.isHome : t.home}
          </button>
          <div>
            <label>
              {t.name}{' '}
              <input
                key={`n-${cur.id}-${cur.name}`}
                defaultValue={cur.name}
                onBlur={(e) => commitName(e.currentTarget)}
                onKeyDown={enterBlur}
              />
            </label>
          </div>
          <div>
            <label>
              {t.route}{' '}
              <input
                key={`r-${cur.id}-${cur.route}`}
                defaultValue={cur.route}
                onBlur={(e) => commitRoute(e.currentTarget)}
                onKeyDown={enterBlur}
              />
            </label>
          </div>
          {error && <div role="alert">{error}</div>}
        </div>
      )}
    </section>
  )
}
