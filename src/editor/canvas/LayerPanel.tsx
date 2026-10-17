import { memo, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createSetHiddenAtDeviceCommand, hiddenState } from './hiddenCommands'
import { findEditablePage, type History, type Id, type UIDocument } from '@/core'
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
  const page = findEditablePage(doc, pageId) ?? doc.pages[0]
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
  const hRef = useRef<RowHandlers | null>(null)

  const rows = useMemo(
    () => (page && deviceId ? buildRows(page, deviceId, collapsed, query) : []),
    [page, deviceId, collapsed, query],
  )
  if (!page || !deviceId) return null

  const meta = (id: Id, patch: { hidden?: boolean; locked?: boolean }, label: string) => {
    // 非表示だけはデバイス別(基準デバイスでは共有の値)
    if (patch.hidden !== undefined && Object.keys(patch).length === 1) {
      history.execute(
        createSetHiddenAtDeviceCommand({
          pageId: page.id,
          deviceId,
          base: isBaseDevice(doc.devices, deviceId),
          nodeIds: [id],
          hidden: patch.hidden,
        }),
      )
      return
    }
    history.execute(createNodeMetaCommand(page.id, id, patch, label))
  }
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

  return (
    <section aria-label={t.title} style={{ textAlign: 'left', fontSize: 13, marginTop: 8 }}>
      <Sync
        handlersRef={hRef}
        value={{
          select: (id, additive) => selectionStore.getState().pick(id, deviceId, additive),
          startEdit,
          setDraft,
          commitEdit,
          cancelEdit: () => {
            skipCommit.current = true
            setEditing(null)
          },
          dragStart: setDrag,
          dragOver: handleOver,
          drop: handleDrop,
          dragEnd: endDrag,
          fold: toggleFold,
          meta,
        }}
      />
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
        {rows.map((row) => (
          <LayerRowView
            key={row.id}
            id={row.id}
            depth={row.depth}
            name={row.node.name || row.node.type}
            rawName={row.node.name}
            hasChildren={row.hasChildren}
            collapsed={row.collapsed}
            hidden={hiddenState(page, deviceId, row.id).hidden}
            locked={page.nodes[row.id]?.locked === true}
            selected={selectedIds.includes(row.id)}
            editing={editing === row.id}
            draft={editing === row.id ? draft : ''}
            overPos={over?.id === row.id ? over.pos : undefined}
            foldDisabled={query !== ''}
            t={t}
            hRef={hRef}
          />
        ))}
      </div>
      <small>{t.hint}</small>
    </section>
  )
}

type RowHandlers = {
  select: (id: Id, additive: boolean) => void
  startEdit: (id: Id, name: string) => void
  setDraft: (v: string) => void
  commitEdit: () => void
  cancelEdit: () => void
  dragStart: (id: Id) => void
  dragOver: (e: React.DragEvent<HTMLDivElement>, id: Id) => void
  drop: (e: React.DragEvent<HTMLDivElement>, id: Id) => void
  dragEnd: () => void
  fold: (id: Id) => void
  meta: (id: Id, patch: { hidden?: boolean; locked?: boolean }, label: string) => unknown
}

// 最新のハンドラを ref に反映する(レンダー中ではなくレイアウト効果で)
function Sync({
  handlersRef,
  value,
}: {
  handlersRef: RefObject<RowHandlers | null>
  value: RowHandlers
}) {
  useLayoutEffect(() => {
    handlersRef.current = value
  })
  return null
}

const SMALL = { border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 2px' }
const rowShadow = (pos: DropPos | undefined) =>
  pos === 'before'
    ? 'inset 0 2px 0 var(--accent)'
    : pos === 'after'
      ? 'inset 0 -2px 0 var(--accent)'
      : pos === 'inside'
        ? 'inset 0 0 0 2px var(--accent)'
        : 'none'

type RowProps = {
  id: Id
  depth: number
  name: string
  rawName: string
  hasChildren: boolean
  collapsed: boolean
  hidden: boolean
  locked: boolean
  selected: boolean
  editing: boolean
  draft: string
  overPos: DropPos | undefined
  foldDisabled: boolean
  t: (typeof TEXT)['ja'] | (typeof TEXT)['en']
  hRef: RefObject<RowHandlers | null>
}

// props は値のみ。構造・選択・編集が変わった行だけ再描画される
const LayerRowView = memo(function LayerRowView(p: RowProps) {
  const h = () => p.hRef.current
  return (
    <div
      role="treeitem"
      aria-selected={p.selected}
      draggable={!p.editing}
      onClick={(e) => h()?.select(p.id, e.shiftKey || e.ctrlKey || e.metaKey)}
      onDoubleClick={() => h()?.startEdit(p.id, p.rawName)}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', p.id)
        e.dataTransfer.effectAllowed = 'move'
        h()?.dragStart(p.id)
      }}
      onDragOver={(e) => h()?.dragOver(e, p.id)}
      onDrop={(e) => h()?.drop(e, p.id)}
      onDragEnd={() => h()?.dragEnd()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        paddingLeft: 4 + p.depth * 14,
        paddingRight: 4,
        cursor: 'pointer',
        background: p.selected ? 'var(--accent-bg)' : 'transparent',
        opacity: p.hidden ? 0.5 : 1,
        boxShadow: rowShadow(p.overPos),
      }}
    >
      <button
        type="button"
        aria-label={p.t.fold}
        disabled={!p.hasChildren || p.foldDisabled}
        onClick={(e) => {
          e.stopPropagation()
          h()?.fold(p.id)
        }}
        style={{ ...SMALL, width: 16, visibility: p.hasChildren ? 'visible' : 'hidden' }}
      >
        {p.collapsed ? '▸' : '▾'}
      </button>
      {p.editing ? (
        <input
          autoFocus
          value={p.draft}
          onChange={(e) => h()?.setDraft(e.target.value)}
          onBlur={() => h()?.commitEdit()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') h()?.commitEdit()
            if (e.key === 'Escape') h()?.cancelEdit()
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
      ) : (
        <span
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {p.name}
        </span>
      )}
      <button
        type="button"
        aria-label={p.t.show}
        title={p.t.show}
        style={SMALL}
        onClick={(e) => {
          e.stopPropagation()
          h()?.meta(p.id, { hidden: !p.hidden }, 'toggle-visibility')
        }}
      >
        <EyeIcon off={p.hidden} />
      </button>
      <button
        type="button"
        aria-label={p.t.lock}
        title={p.t.lock}
        style={SMALL}
        onClick={(e) => {
          e.stopPropagation()
          h()?.meta(p.id, { locked: !p.locked }, 'toggle-lock')
        }}
      >
        <LockIcon locked={p.locked} />
      </button>
    </div>
  )
})

const ICON = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg {...ICON} opacity={off ? 0.55 : 1}>
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
      {off && <path d="M2.5 13.5l11-11" />}
    </svg>
  )
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg {...ICON} opacity={locked ? 1 : 0.55}>
      <rect x="3.5" y="7.5" width="9" height="6" rx="1.2" />
      <path d={locked ? 'M5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2' : 'M5.5 7.5V5.5a2.5 2.5 0 0 1 4.8-1'} />
    </svg>
  )
}
