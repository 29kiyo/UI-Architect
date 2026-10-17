import {
  createAddSlotChildCommand,
  createNode,
  createRemoveSlotChildCommand,
  createSetInstanceVariantCommand,
  findEditablePage,
  type History,
  type UIDocument,
} from '@/core'
import { createNodeForCategory } from '../canvas/palette'
import { selectionStore, useSelection } from '../canvas/selection'

type Props = {
  doc: UIDocument
  history: History
  pageId: string | undefined
  language: 'ja' | 'en'
}

const TEXT = {
  ja: {
    title: 'バリアントとスロット',
    variant: 'バリアント',
    base: '(なし)',
    noVariants: 'バリアントなし(定義の編集で追加)',
    addChild: '子を追加',
    del: '削除',
    noSlots: 'スロットなし(定義の編集で指定)',
    content: 'スロットの内容',
    empty: '(空: 定義の既定を表示)',
  },
  en: {
    title: 'Variants and slots',
    variant: 'Variant',
    base: '(none)',
    noVariants: 'No variants (add in definition edit)',
    addChild: 'Add child',
    del: 'Delete',
    noSlots: 'No slots (set in definition edit)',
    content: 'Slot content',
    empty: '(empty: shows definition default)',
  },
}

export function InstanceExtras({ doc, history, pageId, language }: Props) {
  const t = TEXT[language]
  const selectedIds = useSelection((s) => s.selectedIds)
  const activeDeviceId = useSelection((s) => s.activeDeviceId)
  const page = findEditablePage(doc, pageId)
  const id = selectedIds.length === 1 ? selectedIds[0] : undefined
  const inst = page && id ? page.nodes[id] : undefined
  const ref = inst?.componentRef
  const def = ref ? doc.components.find((c) => c.id === ref.componentId) : undefined
  if (!page || !inst || !ref || !def) return null

  const pick = (nodeId: string) => {
    const dev = activeDeviceId ?? doc.devices[0]?.id
    if (dev) selectionStore.getState().pick(nodeId, dev, false)
  }
  const addChild = (slotId: string) => {
    const node =
      createNodeForCategory('container') ?? createNode({ type: 'element', name: t.content })
    const ok = history.execute(
      createAddSlotChildCommand({ pageId: page.id, instanceId: inst.id, slotId, node }),
    )
    if (ok) pick(node.id)
  }

  return (
    <section aria-label={t.title} style={{ textAlign: 'left', fontSize: 12, marginTop: 8 }}>
      <h3 style={{ margin: '4px 0' }}>{t.title}</h3>
      {def.variants.length === 0 ? (
        <small>{t.noVariants}</small>
      ) : (
        <label>
          {t.variant}{' '}
          <select
            value={ref.variantId ?? ''}
            onChange={(e) =>
              history.execute(
                createSetInstanceVariantCommand(page.id, inst.id, e.target.value || undefined),
              )
            }
          >
            <option value="">{t.base}</option>
            {def.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div style={{ marginTop: 6 }}>
        {def.slots.length === 0 ? (
          <small>{t.noSlots}</small>
        ) : (
          def.slots.map((s) => {
            const kids = (ref.slotContent[s.id] ?? []).filter((c) => inst.children.includes(c))
            return (
              <div key={s.id}>
                <strong>{s.name}</strong>{' '}
                <button type="button" onClick={() => addChild(s.id)}>
                  {t.addChild}
                </button>
                {kids.length === 0 ? (
                  <div>
                    <small>{t.empty}</small>
                  </div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {kids.map((cid) => (
                      <li key={cid}>
                        <button type="button" onClick={() => pick(cid)}>
                          {page.nodes[cid]?.name ?? cid}
                        </button>{' '}
                        <button
                          type="button"
                          onClick={() =>
                            history.execute(
                              createRemoveSlotChildCommand({
                                pageId: page.id,
                                instanceId: inst.id,
                                slotId: s.id,
                                childId: cid,
                              }),
                            )
                          }
                        >
                          {t.del}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
