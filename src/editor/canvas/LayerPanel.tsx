import { useMemo, useRef, useState } from 'react'
import type { History, Id, UIDocument } from '@/core'
import { isBaseDevice } from './commands'
import { buildRows, dropPosition, resolveDrop, type DropPos } from './layers'
import { createMoveToCommand, createNodeMetaCommand } from './nodeCommands'
import { canContain } from './palette'
import { selectionStore, useSelection } from './selection'

type Props = {
  doc: UIDocument
  history: History
  pageId?: string | undefined
  language: 'ja' | 'en'
}

const TEXT = {
  ja: {
    title: 'レイヤー',
    search: '検索(名前・種類)',
    empty: '(該当なし)',
    show: '表示切替',
    lock: 'ロック切替',
    fold: '開閉',
    hint: '下ほど前面 / ダブルクリックで名前変更 / ドラッグで並べ替え',
  },
  en: {
    title: 'Layers',
    search: 'Search (name / type)',
    empty: '(no match)',
    show: 'Toggle visibility',
    lock: 'Toggle lock',
    fold: 'Fold',
    hint: 'Lower = front / double-click to rename / drag to reorder',
  },
} as const

export function LayerPanel({ doc, history, pageId, language }: Props) {
  const t = TEXT[language]
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]
  const selectedIds = useSelection((s) => s.selectedIds)
  const activeDeviceId = useSelection((s) => s.activeDeviceId)
  const deviceId = activeDeviceId ?? doc.devices[0]?.id
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<ReadonlySet<Id>>(new Set())
  const [editing, setEditing] = useState<Id | null>(null)
  const [draft, setDraft] = useState('')
  const [drag, setDrag] = useState<Id | null>(null)
  const [over, setOver] = useState<{ id: Id; pos: DropPos } | null>(null)
  const skipCommit = useRef(false)

  const rows = useMemo(
    () => (page && deviceId ? buildRows(page, deviceId, collapsed, query) : []),
    [page, deviceId, collapsed, query],
  )
  if (!page || !deviceId) return null

  const meta = (id: Id, patch: { hidden?: boolean; locked?: boolean }, label: string) =>
    history.execute(createNodeMetaCommand(page.id, id, patch, label))
  const startEdit = (id: Id, name: string) => {
    skipCommit.current = false
    setEditing(id)
    setDraft(name)
  }
  const commitEdit = () => {
    const id = editing
    setEditing(null)
    const name = draft.trim()
    if (skipCommit.current || !id || !name || page.nodes[id]?.name === name) return
    history.execute(createNodeMetaCommand(page.id, id, { name }, 'rename'))
  }
  const toggleFold = (id: Id) =>
    setCollapsed((s) => {
      const next = new Set(s)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const endDrag = () => {
    setDrag(null)
    setOver(null)
  }
  const handleOver = (e: React.DragEvent<HTMLDivElement>, id: Id) => {
    const dragged = drag ? page.nodes[drag] : undefined
    const target = page.nodes[id]
    if (!drag || !dragged || !target) return
    const r = e.currentTarget.getBoundingClientRect()
    const pos = dropPosition(e.clientY - r.top, r.height, canContain(target, dragged.category))
    if (!resolveDrop(page, deviceId, drag, id, pos)) {
      setOver(null)
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOver((o) => (o && o.id === id && o.pos === pos ? o : { id, pos }))
  }
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, id: Id) => {
    e.preventDefault()
    const d = drag
    const ov = over
    endDrag()
    if (!d || !ov || ov.id !== id) return
    const res = resolveDrop(page, deviceId, d, id, ov.pos)
    if (!res) return
    history.execute(
      createMoveToCommand({
        pageId: page.id,
        deviceId,
        base: isBaseDevice(doc.devices, deviceId),
        nodeId: d,
        parentId: res.parentId,
        beforeId: res.beforeId,
      }),
    )
  }

  const shadow = (pos: DropPos | undefined) =>
    pos === 'before'
      ? 'inset 0 2px 0 var(--accent)'
      : pos === 'after'
        ? 'inset 0 -2px 0 var(--accent)'
        : pos === 'inside'
          ? 'inset 0 0 0 2px var(--accent)'
          : 'none'
  const small = { border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 2px' }

  return (
    <section aria-label={t.title} style={{ textAlign: 'left', fontSize: 13, marginTop: 8 }}>
      <strong>{t.title}</strong>
      <input
        type="search"
        value={query}
        placeholder={t.search}
        aria-label={t.search}
        onChange={(e) => setQuery(e.target.value)}
        style={{ display: 'block', width: '100%', boxSizing: 'border-box', margin: '4px 0' }}
      />
      <div
        role="tree"
        style={{ maxHeight: '40vh', overflow: 'auto', border: '1px solid var(--border)' }}
      >
        {rows.length === 0 && <div style={{ padding: 4 }}>{t.empty}</div>}
        {rows.map((row) => {
          const shared = page.nodes[row.id]
          const selected = selectedIds.includes(row.id)
          return (
            <div
              key={row.id}
              role="treeitem"
              aria-selected={selected}
              draggable={editing !== row.id}
              onClick={(e) =>
                selectionStore
                  .getState()
                  .pick(row.id, deviceId, e.shiftKey || e.ctrlKey || e.metaKey)
              }
              onDoubleClick={() => startEdit(row.id, row.node.name)}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', row.id)
                e.dataTransfer.effectAllowed = 'move'
                setDrag(row.id)
              }}
              onDragOver={(e) => handleOver(e, row.id)}
              onDrop={(e) => handleDrop(e, row.id)}
              onDragEnd={endDrag}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                paddingLeft: 4 + row.depth * 14,
                paddingRight: 4,
                cursor: 'pointer',
                background: selected ? 'var(--accent-bg)' : 'transparent',
                opacity: shared?.hidden ? 0.5 : 1,
                boxShadow: shadow(over?.id === row.id ? over.pos : undefined),
              }}
            >
              <button
                type="button"
                aria-label={t.fold}
                disabled={!row.hasChildren || query !== ''}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFold(row.id)
                }}
                style={{ ...small, width: 16, visibility: row.hasChildren ? 'visible' : 'hidden' }}
              >
                {row.collapsed ? '▸' : '▾'}
              </button>
              {editing === row.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitEdit}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit()
                    if (e.key === 'Escape') {
                      skipCommit.current = true
                      setEditing(null)
                    }
                  }}
                  style={{ flex: 1, minWidth: 0 }}
                />
              ) : (
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.node.name || row.node.type}
                </span>
              )}
              <button
                type="button"
                aria-label={t.show}
                title={t.show}
                style={small}
                onClick={(e) => {
                  e.stopPropagation()
                  meta(row.id, { hidden: !shared?.hidden }, 'toggle-visibility')
                }}
              >
                {shared?.hidden ? '🙈' : '👁'}
              </button>
              <button
                type="button"
                aria-label={t.lock}
                title={t.lock}
                style={small}
                onClick={(e) => {
                  e.stopPropagation()
                  meta(row.id, { locked: !shared?.locked }, 'toggle-lock')
                }}
              >
                {shared?.locked ? '🔒' : '🔓'}
              </button>
            </div>
          )
        })}
      </div>
      <small>{t.hint}</small>
    </section>
  )
}
