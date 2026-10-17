import { useState } from 'react'
import {
  PROP_GROUP_KEYS,
  createAddSlotCommand,
  createAddVariantCommand,
  createRemoveSlotCommand,
  createRemoveVariantCommand,
  createRenameVariantCommand,
  createResetVariantPropCommand,
  createSetVariantPropCommand,
  defNodeOrder,
  newId,
  slotInUse,
  type History,
  type UIDocument,
} from '@/core'
import { useSelection } from '../canvas/selection'
import { PropControl } from '../inspector/controls'
import { appliesTo } from '../inspector/multi'
import { propRegistry, type PropDef } from '../inspector/registry'

type Props = {
  doc: UIDocument
  history: History
  pageId: string | undefined // 定義の編集中は定義の ID
  language: 'ja' | 'en'
}

const TEXT = {
  ja: {
    title: '定義の編集',
    variants: 'バリアント',
    add: 'バリアント追加',
    none: 'バリアントなし',
    editing: '編集するバリアント',
    target: '対象の要素',
    del: '削除',
    confirm: 'このバリアントを削除しますか?(Undo で戻せます)',
    overridden: 'このバリアントのみ',
    reset: '定義に戻す',
    noProps: '編集できる項目がありません',
    slots: 'スロット',
    makeSlot: '選択をスロットにする',
    pickOne: '要素を 1 つ選択してください',
    noSlots: 'スロットなし',
    inUse: '内容が入っているスロットは解除できません',
    unslot: '解除',
  },
  en: {
    title: 'Edit definition',
    variants: 'Variants',
    add: 'Add variant',
    none: 'No variants',
    editing: 'Editing variant',
    target: 'Target node',
    del: 'Delete',
    confirm: 'Delete this variant? (can be undone)',
    overridden: 'This variant only',
    reset: 'Reset to definition',
    noProps: 'No editable properties',
    slots: 'Slots',
    makeSlot: 'Make selection a slot',
    pickOne: 'Select one node',
    noSlots: 'No slots',
    inUse: 'Cannot remove a slot that has content',
    unslot: 'Remove',
  },
}

const NO_SLOT = new Set(['text', 'image', 'svg', 'instance'])

export function DefinitionPanel({ doc, history, pageId, language }: Props) {
  const t = TEXT[language]
  const selectedIds = useSelection((s) => s.selectedIds)
  const [variantId, setVariantId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [propKey, setPropKey] = useState('')
  const def = doc.components.find((c) => c.id === pageId)
  if (!def) return null

  const vr = def.variants.find((v) => v.id === variantId) ?? def.variants[0]
  const order = defNodeOrder(def)
  const tid = order.some((o) => o.id === targetId) ? targetId : def.rootNodeId
  const tn = def.nodes[tid]
  const defs: PropDef[] = tn
    ? PROP_GROUP_KEYS.flatMap((g) => propRegistry.forGroup(g)).filter((d) => appliesTo(d, tn))
    : []
  const pd = defs.find((d) => `${d.group}.${d.key}` === propKey) ?? defs[0]
  const stored = pd ? vr?.overrides[tid]?.propsDiff[pd.group]?.[pd.key] : undefined
  const shown = stored ?? (pd ? tn?.props[pd.group]?.[pd.key] : undefined)
  const nameOf = (id: string) => def.nodes[id]?.name ?? id

  const only = selectedIds.length === 1 ? selectedIds[0] : undefined
  const selNode = only ? def.nodes[only] : undefined
  const canSlot =
    !!selNode && !NO_SLOT.has(selNode.type) && !def.slots.some((s) => s.nodeId === only)

  const addVariant = () => {
    const id = newId()
    history.execute(
      createAddVariantCommand(def.id, {
        id,
        name: `Variant ${def.variants.length + 1}`,
        overrides: {},
      }),
    )
    setVariantId(id)
  }
  const setValue = (d: PropDef, v: string | number, live: boolean) => {
    if (!vr) return
    history.execute(
      createSetVariantPropCommand({
        componentId: def.id,
        variantId: vr.id,
        nodeId: tid,
        group: d.group,
        key: d.key,
        value: v,
        ...(live ? { coalesceKey: `variant:${vr.id}:${tid}:${d.group}.${d.key}` } : {}),
      }),
    )
  }

  return (
    <section aria-label={t.title} style={{ textAlign: 'left', fontSize: 12, marginTop: 8 }}>
      <h3 style={{ margin: '4px 0' }}>{t.title}</h3>
      <strong>{t.variants}</strong>{' '}
      <button type="button" onClick={addVariant}>
        {t.add}
      </button>
      {!vr ? (
        <div>
          <small>{t.none}</small>
        </div>
      ) : (
        <>
          <div>
            <label>
              {t.editing}{' '}
              <select value={vr.id} onChange={(e) => setVariantId(e.target.value)}>
                {def.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <input
              key={`${vr.id}-${vr.name}`}
              defaultValue={vr.name}
              onBlur={(e) => {
                const v = e.currentTarget.value.trim()
                if (!v) e.currentTarget.value = vr.name
                else if (v !== vr.name) {
                  history.execute(createRenameVariantCommand(def.id, vr.id, v))
                }
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />{' '}
            <button
              type="button"
              onClick={() =>
                window.confirm(t.confirm) &&
                history.execute(createRemoveVariantCommand(def.id, vr.id))
              }
            >
              {t.del}
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
          {pd ? (
            <div style={{ margin: '4px 0' }}>
              <select value={`${pd.group}.${pd.key}`} onChange={(e) => setPropKey(e.target.value)}>
                {defs.map((d) => (
                  <option key={`${d.group}.${d.key}`} value={`${d.group}.${d.key}`}>
                    {d.group}: {d.label[language]}
                  </option>
                ))}
              </select>
              {stored !== undefined && (
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
                        createResetVariantPropCommand({
                          componentId: def.id,
                          variantId: vr.id,
                          nodeId: tid,
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
                key={`${vr.id}:${tid}:${pd.group}.${pd.key}`}
                def={pd}
                value={shown}
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
      <div style={{ marginTop: 6 }}>
        <strong>{t.slots}</strong>{' '}
        <button
          type="button"
          disabled={!canSlot}
          onClick={() =>
            only &&
            history.execute(
              createAddSlotCommand({
                componentId: def.id,
                slotId: newId(),
                name: '',
                nodeId: only,
              }),
            )
          }
        >
          {t.makeSlot}
        </button>
        {!selNode && (
          <div>
            <small>{t.pickOne}</small>
          </div>
        )}
      </div>
      {def.slots.length === 0 ? (
        <small>{t.noSlots}</small>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {def.slots.map((s) => {
            const used = slotInUse(doc, def.id, s.id)
            return (
              <li key={s.id}>
                {s.name} ({nameOf(s.nodeId)}){' '}
                <button
                  type="button"
                  disabled={used}
                  title={used ? t.inUse : ''}
                  onClick={() => history.execute(createRemoveSlotCommand(def.id, s.id))}
                >
                  {t.unslot}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
