import {
  PROP_GROUP_KEYS,
  resolveNode,
  type History,
  type Props as NodeProps,
  type UIDocument,
} from '@/core'
import { createPropsCommand, isBaseDevice } from '../canvas/commands'
import { useSelection } from '../canvas/selection'
import { PropControl } from './controls'
import {
  createAttachCommand,
  createDetachCommand,
  createResetPropCommand,
  isDetachedAt,
  overrideState,
} from './overrideCommands'
import { OverrideBar, PropLabel } from './overrideUi'
import { TokenPicker } from './tokenUi'
import { propRegistry, type PropDef } from './registry'

type Props = {
  doc: UIDocument
  history: History
  pageId?: string | undefined
  language: 'ja' | 'en'
}

const TEXT = {
  ja: {
    title: 'インスペクタ',
    empty: '要素を選択してください',
    multi: (n: number) => `${n} 件選択中(先頭の 1 件を編集)`,
    category: '種類',
    groups: {
      layout: 'レイアウト',
      size: 'サイズ',
      position: '位置',
      appearance: '外観',
      border: '枠線',
      radius: '角丸',
      shadow: '影',
      effects: '効果',
      transform: '変形',
      typography: '文字',
      content: '内容',
      states: '状態',
      transition: 'トランジション',
      custom: 'カスタム',
    },
  },
  en: {
    title: 'Inspector',
    empty: 'Select an element',
    multi: (n: number) => `${n} selected (editing the first)`,
    category: 'Category',
    groups: {
      layout: 'Layout',
      size: 'Size',
      position: 'Position',
      appearance: 'Appearance',
      border: 'Border',
      radius: 'Radius',
      shadow: 'Shadow',
      effects: 'Effects',
      transform: 'Transform',
      typography: 'Typography',
      content: 'Content',
      states: 'States',
      transition: 'Transition',
      custom: 'Custom',
    },
  },
} as const

export function Inspector({ doc, history, pageId, language }: Props) {
  const t = TEXT[language]
  const selectedIds = useSelection((s) => s.selectedIds)
  const activeDeviceId = useSelection((s) => s.activeDeviceId)
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]
  const deviceId = activeDeviceId ?? doc.devices[0]?.id
  const nodeId = selectedIds[0]
  const node = page && deviceId && nodeId ? resolveNode(page, deviceId, nodeId) : undefined

  const set = (def: PropDef, value: string | number, live = false) => {
    if (!page || !deviceId || !node) return
    history.execute(
      createPropsCommand({
        name: `inspector: ${def.key}`,
        pageId: page.id,
        deviceId,
        // デバイス別に持てない値(content 等)は常に共有側へ
        base: def.deviceOverridable ? isBaseDevice(doc.devices, deviceId) : true,
        writes: [{ nodeId: node.id, group: def.group, key: def.key, value }],
        ...(live
          ? { coalesceKey: `inspector:${node.id}:${deviceId}:${def.group}.${def.key}` }
          : {}),
      }),
    )
  }

  const target =
    page && deviceId && node ? { pageId: page.id, deviceId, nodeId: node.id } : undefined
  const detached = page && deviceId && node ? isDetachedAt(page, deviceId, node.id) : false
  const reset = (g: keyof NodeProps, def: PropDef) => {
    if (target) history.execute(createResetPropCommand(target, g, def.key))
  }
  // 印は「上書き中」のときだけ。デバイス別に持てない値は常に印なし
  const labelState = (g: keyof NodeProps, def: PropDef) =>
    page && deviceId && node && def.deviceOverridable
      ? overrideState(page, deviceId, node.id, g, def.key)
      : undefined

  return (
    <section aria-label={t.title} style={{ textAlign: 'left', fontSize: 12 }}>
      <h3 style={{ margin: '4px 0' }}>{t.title}</h3>
      {!node ? (
        <div>{t.empty}</div>
      ) : (
        <>
          {selectedIds.length > 1 && <div>{t.multi(selectedIds.length)}</div>}
          <div style={{ margin: '4px 0' }}>
            <strong>{node.name}</strong> ({t.category}: {node.category})
          </div>
          {deviceId && (
            <OverrideBar
              deviceName={doc.devices.find((d) => d.id === deviceId)?.name ?? ''}
              isBase={isBaseDevice(doc.devices, deviceId)}
              detached={detached}
              language={language}
              onDetach={() => target && history.execute(createDetachCommand(target))}
              onAttach={() => target && history.execute(createAttachCommand(target))}
            />
          )}
          <div style={{ maxHeight: '70vh', overflow: 'auto', border: '1px solid var(--border)' }}>
            {PROP_GROUP_KEYS.map((g: keyof NodeProps) => {
              const defs = propRegistry.forCategory(node.category, g)
              if (defs.length === 0) return null
              return (
                <details key={g} open={g === 'size' || g === 'content' || g === 'appearance'}>
                  <summary style={{ cursor: 'pointer', padding: '2px 4px' }}>{t.groups[g]}</summary>
                  <div style={{ padding: '0 4px 4px' }}>
                    {defs.map((def) => (
                      <label
                        key={`${node.id}:${deviceId}:${g}.${def.key}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '96px 1fr',
                          gap: 4,
                          alignItems: 'center',
                          margin: '2px 0',
                        }}
                      >
                        <PropLabel
                          label={def.label[language]}
                          language={language}
                          state={labelState(g, def)}
                          canReset={!detached}
                          onReset={() => reset(g, def)}
                        />
                        <PropControl
                          def={def}
                          value={node.props[g][def.key]}
                          language={language}
                          onCommit={(v, live) => set(def, v, live)}
                        />
                        <span />
                        <TokenPicker
                          def={def}
                          value={node.props[g][def.key]}
                          tokens={doc.tokens}
                          language={language}
                          onCommit={(v) => set(def, v)}
                        />
                      </label>
                    ))}
                  </div>
                </details>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
