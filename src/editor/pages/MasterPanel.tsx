import { useState } from 'react'
import {
  createAddMasterCommand,
  createMasterFor,
  createMoveMasterCommand,
  createRemoveMasterCommand,
  createRenameMasterCommand,
  createSetMasterHiddenCommand,
  createSetMasterPositionCommand,
  visibleMasters,
  type History,
  type MasterPosition,
  type UIDocument,
} from '@/core'

type Props = {
  doc: UIDocument
  history: History
  pageId: string | undefined // 編集中のページ or マスターの ID
  language: 'ja' | 'en'
  onSelect: (id: string) => void
}

const TEXT = {
  ja: {
    title: 'マスター(共通部品)',
    add: '追加',
    pos: { top: '上に積む', bottom: '下に積む', overlay: '重ねる' },
    editing: '編集中のマスター',
    name: '名前',
    position: '位置',
    up: '上へ',
    down: '下へ',
    del: '削除',
    confirm: 'このマスターを削除しますか?(Undo で戻せます)',
    show: 'このページでの表示',
    none: 'マスターはありません',
    hint: 'クリックで編集。ページに戻るにはページ一覧から選択',
  },
  en: {
    title: 'Masters',
    add: 'Add',
    pos: { top: 'Stack on top', bottom: 'Stack at bottom', overlay: 'Overlay' },
    editing: 'Editing master',
    name: 'Name',
    position: 'Position',
    up: 'Up',
    down: 'Down',
    del: 'Delete',
    confirm: 'Delete this master? (can be undone)',
    show: 'Shown on this page',
    none: 'No masters',
    hint: 'Click to edit. Pick a page to go back',
  },
}
const POSITIONS: MasterPosition[] = ['top', 'bottom', 'overlay']

export function MasterPanel({ doc, history, pageId, language, onSelect }: Props) {
  const t = TEXT[language]
  const [newPos, setNewPos] = useState<MasterPosition>('top')
  const idx = doc.masters.findIndex((m) => m.id === pageId)
  const cm = doc.masters[idx]
  const cp = doc.pages.find((p) => p.id === pageId)
  const shown = cp ? new Set(visibleMasters(doc, cp).map((m) => m.id)) : new Set<string>()

  const add = () => {
    const m = createMasterFor(doc, newPos)
    history.execute(createAddMasterCommand(m))
    onSelect(m.id)
  }
  const remove = () => {
    if (!cm || !window.confirm(t.confirm)) return
    history.execute(createRemoveMasterCommand(cm.id))
  }
  const commitName = (el: HTMLInputElement) => {
    if (!cm) return
    const v = el.value.trim()
    if (!v) el.value = cm.name
    else if (v !== cm.name) history.execute(createRenameMasterCommand(cm.id, v))
  }

  return (
    <section style={{ textAlign: 'left', marginBottom: 8 }}>
      <h3 style={{ margin: '4px 0' }}>{t.title}</h3>
      {doc.masters.length === 0 ? (
        <small>{t.none}</small>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {doc.masters.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onSelect(m.id)}
                style={{ fontWeight: m.id === pageId ? 'bold' : 'normal', width: '100%' }}
              >
                {m.name} <small>{t.pos[m.position]}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <select value={newPos} onChange={(e) => setNewPos(e.target.value as MasterPosition)}>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {t.pos[p]}
            </option>
          ))}
        </select>{' '}
        <button type="button" onClick={add}>
          {t.add}
        </button>
      </div>
      {doc.masters.length > 0 && <small>{t.hint}</small>}
      {cm && (
        <div>
          <strong>{t.editing}</strong>
          <div>
            <label>
              {t.name}{' '}
              <input
                key={`n-${cm.id}-${cm.name}`}
                defaultValue={cm.name}
                onBlur={(e) => commitName(e.currentTarget)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            </label>
          </div>
          <div>
            <label>
              {t.position}{' '}
              <select
                value={cm.position}
                onChange={(e) =>
                  history.execute(
                    createSetMasterPositionCommand(cm.id, e.target.value as MasterPosition),
                  )
                }
              >
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {t.pos[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={idx <= 0}
            onClick={() => history.execute(createMoveMasterCommand(cm.id, idx - 1))}
          >
            {t.up}
          </button>{' '}
          <button
            type="button"
            disabled={idx >= doc.masters.length - 1}
            onClick={() => history.execute(createMoveMasterCommand(cm.id, idx + 1))}
          >
            {t.down}
          </button>{' '}
          <button type="button" onClick={remove}>
            {t.del}
          </button>
        </div>
      )}
      {cp && doc.masters.length > 0 && (
        <div>
          <strong>{t.show}</strong>
          {doc.masters.map((m) => (
            <div key={m.id}>
              <label>
                <input
                  type="checkbox"
                  checked={shown.has(m.id)}
                  onChange={(e) =>
                    history.execute(createSetMasterHiddenCommand(cp.id, m.id, !e.target.checked))
                  }
                />{' '}
                {m.name}
              </label>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
