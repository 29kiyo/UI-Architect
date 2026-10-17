import { useEffect, useState } from 'react'
import { findEditablePage, type History, type UIDocument } from '@/core'
import { isBaseDevice } from '../canvas/commands'
import { useSelection } from '../canvas/selection'
import { setStatePreview } from '../canvas/statePreview'
import { PropControl } from './controls'
import { ColorEndContext } from './LiveColor'
import { resolveSelected } from './multi'
import { propRegistry, type PropDef } from './registry'
import {
  createStateStyleCommand,
  STATE_NAMES,
  STATE_PROPS,
  stateStyleOf,
  type StateName,
  type StateValue,
} from './stateStyle'

type Props = {
  doc: UIDocument
  history: History
  pageId?: string | undefined
  language: 'ja' | 'en'
}

const TEXT = {
  ja: {
    title: '状態別スタイル',
    state: '状態',
    normal: '通常(編集しない)',
    names: {
      hover: 'hover',
      active: 'active',
      focus: 'focus',
      disabled: 'disabled',
      checked: 'checked',
    },
    hint: '選んだ状態のスタイルを、選択中の要素にだけ重ねて表示します(保存はされません。実際の動作は Phase 9)',
    clear: 'この項目を消す',
    empty: '要素を選択してください',
  },
  en: {
    title: 'State styles',
    state: 'State',
    normal: 'Normal (no editing)',
    names: {
      hover: 'hover',
      active: 'active',
      focus: 'focus',
      disabled: 'disabled',
      checked: 'checked',
    },
    hint: 'Overlays the chosen state on the selected elements (display only; real behavior is Phase 9)',
    clear: 'Clear this value',
    empty: 'Select an element',
  },
} as const

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function StatePanel({ doc, history, pageId, language }: Props) {
  const t = TEXT[language]
  const [state, setState] = useState<StateName | ''>('')
  const selectedIds = useSelection((s) => s.selectedIds)
  const activeDeviceId = useSelection((s) => s.activeDeviceId)
  const page = findEditablePage(doc, pageId) ?? doc.pages[0]
  const deviceId = activeDeviceId ?? doc.devices[0]?.id
  const nodes = page && deviceId ? resolveSelected(page, deviceId, selectedIds) : []
  const idsKey = nodes.map((n) => n.id).join(',')

  // 選んだ状態を選択ノードに重ねて表示(外れたら戻す)
  useEffect(() => {
    setStatePreview(state || undefined, idsKey ? idsKey.split(',') : [])
    return () => setStatePreview(undefined, [])
  }, [state, idsKey])

  const defs = STATE_PROPS.flatMap(([g, k]) => {
    const d = propRegistry.get(g, k)
    return d ? [d] : []
  })

  const write = (def: PropDef, value: StateValue | undefined, live = false) => {
    if (!page || !deviceId || !state || nodes.length === 0) return
    history.execute(
      createStateStyleCommand({
        pageId: page.id,
        deviceId,
        base: isBaseDevice(doc.devices, deviceId),
        state,
        writes: nodes.map((n) => ({ nodeId: n.id, key: def.key, value })),
        ...(live ? { coalesceKey: `state:${deviceId}:${state}:${def.key}:${idsKey}` } : {}),
      }),
    )
  }

  return (
    <ColorEndContext.Provider value={() => history.breakCoalescing()}>
      <section aria-label={t.title} style={{ textAlign: 'left', fontSize: 12, marginTop: 8 }}>
        <h3 style={{ margin: '4px 0' }}>{t.title}</h3>
        {nodes.length === 0 ? (
          <div>{t.empty}</div>
        ) : (
          <>
            <label>
              {t.state}{' '}
              <select value={state} onChange={(e) => setState(e.target.value as StateName | '')}>
                <option value="">{t.normal}</option>
                {STATE_NAMES.map((s) => (
                  <option key={s} value={s}>
                    {t.names[s]}
                  </option>
                ))}
              </select>
            </label>
            {state && (
              <>
                <div style={{ margin: '4px 0', opacity: 0.7 }}>{t.hint}</div>
                {defs.map((def) => {
                  const vals = nodes.map((n) => stateStyleOf(n, state)[def.key])
                  const mixed = vals.some((v) => !same(v, vals[0]))
                  const value = mixed ? undefined : vals[0]
                  return (
                    <div
                      key={`${idsKey}:${deviceId}:${state}:${def.group}.${def.key}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '96px 1fr 20px',
                        gap: 4,
                        alignItems: 'center',
                        margin: '2px 0',
                      }}
                    >
                      <span>{def.label[language]}</span>
                      <div style={{ minWidth: 0 }}>
                        <PropControl
                          def={def}
                          value={value}
                          mixed={mixed}
                          language={language}
                          onCommit={(v, live) => write(def, v, live)}
                        />
                      </div>
                      <button
                        type="button"
                        title={t.clear}
                        aria-label={t.clear}
                        disabled={vals.every((v) => v === undefined)}
                        onClick={() => write(def, undefined)}
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}
      </section>
    </ColorEndContext.Provider>
  )
}
