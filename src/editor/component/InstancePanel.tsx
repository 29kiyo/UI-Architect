import { useState } from 'react'
import {
  PROP_GROUP_KEYS,
  createResetInstanceOverrideCommand,
  createSetInstanceHiddenCommand,
  createSetInstanceOverrideCommand,
  defNodeOrder,
  findEditablePage,
  resolveInstanceIn,
  type History,
  type Props as NodeProps,
  type UIDocument,
} from '@/core'
import { useSelection } from '../canvas/selection'
import { PropControl } from '../inspector/controls'
import { appliesTo } from '../inspector/multi'
import { propRegistry, type PropDef } from '../inspector/registry'

type Props = {
  doc: UIDocument
  history: History
  pageId: string | undefined
  language: 'ja' | 'en'
  onEditDef: (componentId: string) => void
}

const TEXT = {
  ja: {
    title: 'インスタンスの上書き',
    editDef: '定義を編集',
    target: '対象の要素',
    prop: '項目',
    hidden: '非表示',
    resetAll: 'すべてリセット',
    none: '上書きなし',
    noProps: '編集できる項目がありません',
    overridden: 'このインスタンスのみ',
    reset: '定義に戻す',
    list: '上書き一覧',
  },
  en: {
    title: 'Instance overrides',
    editDef: 'Edit definition',
    target: 'Target node',
    prop: 'Property',
    hidden: 'Hidden',
    resetAll: 'Reset all',
    none: 'No overrides',
    noProps: 'No editable properties',
    overridden: 'This instance only',
    reset: 'Reset to definition',
    list: 'Overrides',
  },
}

export function InstancePanel({ doc, history, pageId, language, onEditDef }: Props) {
  const t = TEXT[language]
  const selectedIds = useSelection((s) => s.selectedIds)
  const [targetId, setTargetId] = useState('')
  const [propKey, setPropKey] = useState('')
  const page = findEditablePage(doc, pageId)
  const id = selectedIds.length === 1 ? selectedIds[0] : undefined
  const inst = page && id ? page.nodes[id] : undefined
  const ref = inst?.componentRef
  const def = ref ? doc.components.find((c) => c.id === ref.componentId) : undefined
  if (!page || !inst || !ref || !def) return null

  const order = defNodeOrder(def)
  const tid = order.some((o) => o.id === targetId) ? targetId : def.rootNodeId
  const resolved = resolveInstanceIn(doc.components, inst)
  const tn = resolved?.nodes[tid]
  const defs: PropDef[] = tn
    ? PROP_GROUP_KEYS.flatMap((g) => propRegistry.forGroup(g)).filter((d) => appliesTo(d, tn))
    : []
  const pd = defs.find((d) => `${d.group}.${d.key}` === propKey) ?? defs[0]
  const ov = ref.overrides[tid]
  const isOv = !!pd && ov?.propsDiff[pd.group]?.[pd.key] !== undefined
  const base = { pageId: page.id, instanceId: inst.id }

  const setValue = (d: PropDef, v: string | number, live = false) =>
    history.execute(
      createSetInstanceOverrideCommand({
        ...base,
        targetId: tid,
        group: d.group,
        key: d.key,
        value: v,
        ...(live ? { coalesceKey: `inst:${inst.id}:${tid}:${d.group}.${d.key}` } : {}),
      }),
    )
  const nameOf = (nid: string) => def.nodes[nid]?.name ?? nid
  const entries = Object.entries(ref.overrides)

  return (
    <section aria-label={t.title} style={{ textAlign: 'left', fontSize: 12, marginTop: 8 }}>
      <h3 style={{ margin: '4px 0' }}>{t.title}</h3>
      <div>
        <strong>{def.name}</strong>{' '}
        <button type="button" onClick={() => onEditDef(def.id)}>
          {t.editDef}
        </button>
      </div>
      <div>
        <label>
          {t.target}{' '}
          <select value={tid} onChange={(e) => setTargetId(e.target.value)}>
            {order.map((o) => (
              <option key={o.id} value={o.id}>
                {'\u00a0\u00a0'.repeat(o.depth)}
                {nameOf(o.id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {tn && (
        <>
          <div>
            <label>
              <input
                type="checkbox"
                checked={tn.hidden}
                onChange={(e) =>
                  history.execute(
                    createSetInstanceHiddenCommand({
                      ...base,
                      targetId: tid,
                      hidden: e.target.checked,
                    }),
                  )
                }
              />{' '}
              {t.hidden}
            </label>
            {ov?.hidden !== undefined && (
              <button
                type="button"
                title={t.reset}
                onClick={() =>
                  history.execute(
                    createSetInstanceHiddenCommand({ ...base, targetId: tid, hidden: undefined }),
                  )
                }
              >
                ↺
              </button>
            )}
          </div>
          {pd ? (
            <div style={{ margin: '4px 0' }}>
              <select value={`${pd.group}.${pd.key}`} onChange={(e) => setPropKey(e.target.value)}>
                {defs.map((d) => (
                  <option key={`${d.group}.${d.key}`} value={`${d.group}.${d.key}`}>
                    {d.group}: {d.label[language]}
                  </option>
                ))}
              </select>
              {isOv && (
                <>
                  {' '}
                  <span title={t.overridden} style={{ color: 'var(--accent)' }}>
                    ●
                  </span>
                  <button
                    type="button"
                    title={t.reset}
                    onClick={() =>
                      history.execute(
                        createResetInstanceOverrideCommand({
                          ...base,
                          targetId: tid,
                          group: pd.group,
                          key: pd.key,
                        }),
                      )
                    }
                  >
                    ↺
                  </button>
                </>
              )}
              <PropControl
                key={`${inst.id}:${tid}:${pd.group}.${pd.key}`}
                def={pd}
                value={tn.props[pd.group]?.[pd.key]}
                mixed={false}
                language={language}
                onCommit={(v, live) => setValue(pd, v, live)}
              />
            </div>
          ) : (
            <small>{t.noProps}</small>
          )}
        </>
      )}
      <div>
        <strong>{t.list}</strong>{' '}
        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => history.execute(createResetInstanceOverrideCommand(base))}
          >
            {t.resetAll}
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <small>{t.none}</small>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {entries.flatMap(([nid, o]) => [
            ...Object.entries(o.propsDiff).flatMap(([g, grp]) =>
              Object.entries(grp ?? {}).map(([k, v]) => (
                <li key={`${nid}:${g}.${k}`}>
                  {nameOf(nid)} / {g}.{k} = {JSON.stringify(v)}{' '}
                  <button
                    type="button"
                    title={t.reset}
                    onClick={() =>
                      history.execute(
                        createResetInstanceOverrideCommand({
                          ...base,
                          targetId: nid,
                          group: g as keyof NodeProps,
                          key: k,
                        }),
                      )
                    }
                  >
                    ↺
                  </button>
                </li>
              )),
            ),
            ...(o.hidden !== undefined
              ? [
                  <li key={`${nid}:hidden`}>
                    {nameOf(nid)} / hidden = {String(o.hidden)}{' '}
                    <button
                      type="button"
                      title={t.reset}
                      onClick={() =>
                        history.execute(
                          createSetInstanceHiddenCommand({
                            ...base,
                            targetId: nid,
                            hidden: undefined,
                          }),
                        )
                      }
                    >
                      ↺
                    </button>
                  </li>,
                ]
              : []),
          ])}
        </ul>
      )}
    </section>
  )
}
