import { useState } from 'react'
import {
  componentizeBlocker,
  componentsForPage,
  createAddInstanceCommand,
  createComponentFromNodeCommand,
  createDetachInstanceCommand,
  createInstanceFor,
  createRemoveComponentCommand,
  createRenameComponentCommand,
  findComponentUsages,
  findEditablePage,
  newId,
  type History,
  type UIDocument,
} from '@/core'
import { selectionStore, useSelection } from '../canvas/selection'

type Props = {
  doc: UIDocument
  history: History
  pageId: string | undefined
  language: 'ja' | 'en'
}

const TEXT = {
  ja: {
    title: 'コンポーネント',
    make: '選択をコンポーネント化',
    name: '名前(空なら要素名)',
    scope: { project: 'プロジェクト全体', page: 'このページ専用' },
    place: '配置',
    del: '削除',
    detach: '選択のインスタンスを解除',
    used: (n: number) => `使用 ${n}`,
    none: 'コンポーネントはありません',
    blocked: {
      none: '要素を 1 つ選択してください',
      missing: '選択した要素が見つかりません',
      root: 'ルートはコンポーネント化できません',
      instance: 'インスタンスを含む要素はできません',
    },
    inUse: '使用中は削除できません',
    confirm: 'このコンポーネントを削除しますか?(Undo で戻せます)',
  },
  en: {
    title: 'Components',
    make: 'Make component from selection',
    name: 'Name (blank = node name)',
    scope: { project: 'Whole project', page: 'This page only' },
    place: 'Place',
    del: 'Delete',
    detach: 'Detach selected instance',
    used: (n: number) => `Used ${n}`,
    none: 'No components',
    blocked: {
      none: 'Select one node',
      missing: 'Selected node not found',
      root: 'The root cannot be a component',
      instance: 'Cannot include instances',
    },
    inUse: 'Cannot delete while in use',
    confirm: 'Delete this component? (can be undone)',
  },
}

export function ComponentPanel({ doc, history, pageId, language }: Props) {
  const t = TEXT[language]
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'project' | 'page'>('project')
  const selectedIds = useSelection((s) => s.selectedIds)
  const activeDeviceId = useSelection((s) => s.activeDeviceId)
  const page = findEditablePage(doc, pageId)
  const list = componentsForPage(doc, pageId)

  const only = selectedIds.length === 1 ? selectedIds[0] : undefined
  const selNode = page && only ? page.nodes[only] : undefined
  const blocker = !page || !only ? 'none' : componentizeBlocker(page, only)
  const isInstance = !!selNode?.componentRef

  const make = () => {
    if (!page || !only || blocker) return
    history.execute(
      createComponentFromNodeCommand({
        pageId: page.id,
        nodeId: only,
        componentId: newId(),
        name,
        scope,
      }),
    )
    setName('')
  }
  const place = (componentId: string) => {
    if (!page) return
    const node = createInstanceFor(doc, componentId)
    const ok = history.execute(createAddInstanceCommand(page.id, node, page.rootNodeId))
    const dev = activeDeviceId ?? doc.devices[0]?.id
    if (ok && dev) selectionStore.getState().pick(node.id, dev, false)
  }
  const detach = () => {
    if (!page || !only || !isInstance) return
    history.execute(createDetachInstanceCommand(page.id, only))
  }

  return (
    <section aria-label={t.title} style={{ textAlign: 'left', marginBottom: 8, fontSize: 13 }}>
      <h3 style={{ margin: '4px 0' }}>{t.title}</h3>
      {list.length === 0 ? (
        <small>{t.none}</small>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {list.map((c) => {
            const used = findComponentUsages(doc, c.id).length
            return (
              <li key={c.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  key={`${c.id}-${c.name}`}
                  defaultValue={c.name}
                  style={{ flex: 1, minWidth: 0 }}
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim()
                    if (!v) e.currentTarget.value = c.name
                    else if (v !== c.name) history.execute(createRenameComponentCommand(c.id, v))
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                <small title={t.scope[c.scope ?? 'project']}>
                  {c.scope === 'page' ? '◧' : '◼'} {t.used(used)}
                </small>
                <button type="button" onClick={() => place(c.id)}>
                  {t.place}
                </button>
                <button
                  type="button"
                  disabled={used > 0}
                  title={used > 0 ? t.inUse : ''}
                  onClick={() =>
                    window.confirm(t.confirm) && history.execute(createRemoveComponentCommand(c.id))
                  }
                >
                  {t.del}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div style={{ marginTop: 4 }}>
        <input
          value={name}
          placeholder={t.name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
        <select value={scope} onChange={(e) => setScope(e.target.value as 'project' | 'page')}>
          <option value="project">{t.scope.project}</option>
          <option value="page">{t.scope.page}</option>
        </select>{' '}
        <button type="button" disabled={blocker !== null} onClick={make}>
          {t.make}
        </button>
        {blocker && (
          <div>
            <small>{t.blocked[blocker]}</small>
          </div>
        )}
      </div>
      <div style={{ marginTop: 4 }}>
        <button type="button" disabled={!isInstance} onClick={detach}>
          {t.detach}
        </button>
      </div>
    </section>
  )
}
