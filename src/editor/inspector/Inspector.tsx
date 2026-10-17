import {
  PROP_GROUP_KEYS,
  findEditablePage,
  type History,
  type Props as NodeProps,
  type UIDocument,
} from '@/core'
import { createPropsCommand, isBaseDevice } from '../canvas/commands'
import { createAddAssetCommand, prepareImageAsset, type ImageSinks } from '../canvas/imageActions'
import { AssetPicker } from './AssetPicker'
import { FontPicker } from './FontPicker'
import { LinkPicker } from './LinkPicker'
import { useSelection } from '../canvas/selection'
import { PropControl } from './controls'
import { ColorEndContext } from './LiveColor'
import {
  createAttachCommand,
  createDetachCommand,
  createResetPropCommand,
  isDetachedAt,
  overrideState,
} from './overrideCommands'
import { OverrideBar, PropLabel } from './overrideUi'
import { applicableNodes, resolveSelected, shownValue, writesFor } from './multi'
import { TokenPicker } from './tokenUi'
import { propRegistry, type PropDef } from './registry'

type Props = {
  doc: UIDocument
  history: History
  pageId?: string | undefined
  language: 'ja' | 'en'
  // 画像のファイル差し替え用の保存先(未指定ならボタンを出さない)
  sinks?: ImageSinks | undefined
}

const TEXT = {
  ja: {
    title: 'インスペクタ',
    empty: '要素を選択してください',
    multi: (n: number) => `${n} 件選択中(一括編集。値が違う項目は —)`,
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
    multi: (n: number) => `${n} selected (bulk edit; differing values show —)`,
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

type Cmd = Parameters<History['execute']>[0]

export function Inspector({ doc, history, pageId, language, sinks }: Props) {
  const t = TEXT[language]
  const selectedIds = useSelection((s) => s.selectedIds)
  const activeDeviceId = useSelection((s) => s.activeDeviceId)
  const page = findEditablePage(doc, pageId) ?? doc.pages[0]
  const deviceId = activeDeviceId ?? doc.devices[0]?.id
  const nodes = page && deviceId ? resolveSelected(page, deviceId, selectedIds) : []
  const first = nodes[0]
  const idsKey = nodes.map((n) => n.id).join(',')

  const set = (def: PropDef, value: string | number, live = false) => {
    if (!page || !deviceId) return
    const writes = writesFor(nodes, def, value)
    if (writes.length === 0) return
    history.execute(
      createPropsCommand({
        name: `inspector: ${def.key}`,
        pageId: page.id,
        deviceId,
        // デバイス別に持てない値(content 等)は常に共有側へ
        base: def.deviceOverridable ? isBaseDevice(doc.devices, deviceId) : true,
        writes,
        ...(live ? { coalesceKey: `inspector:${deviceId}:${def.group}.${def.key}:${idsKey}` } : {}),
      }),
    )
  }

  // 画像ファイルを Asset 化し、Asset 追加と src 更新を 1 履歴にまとめる
  const replaceFromFile = async (def: PropDef, file: File) => {
    if (!sinks) return
    const asset = await prepareImageAsset(doc, file, sinks)
    if (!asset) return
    history.transaction('replace image', () => {
      history.execute(createAddAssetCommand(asset))
      set(def, `asset:${asset.id}`)
    })
  }

  const targets =
    page && deviceId ? nodes.map((n) => ({ pageId: page.id, deviceId, nodeId: n.id })) : []
  // 複数ノードの操作は 1 履歴にまとめる
  const runAll = (name: string, cmds: Cmd[]) => {
    const [only] = cmds
    if (!only) return
    if (cmds.length === 1) history.execute(only)
    else
      history.transaction(name, () => {
        for (const c of cmds) history.execute(c)
      })
  }
  const detachedAll =
    !!page &&
    !!deviceId &&
    nodes.length > 0 &&
    nodes.every((n) => isDetachedAt(page, deviceId, n.id))
  const canReset = !!page && !!deviceId && nodes.some((n) => !isDetachedAt(page, deviceId, n.id))
  const stateAt = (g: keyof NodeProps, def: PropDef, id: string) =>
    page && deviceId ? overrideState(page, deviceId, id, g, def.key) : 'shared'
  // 印は「1 つでも上書き中」のときだけ。デバイス別に持てない値は常に印なし
  const labelState = (g: keyof NodeProps, def: PropDef) =>
    def.deviceOverridable &&
    applicableNodes(nodes, def).some((n) => stateAt(g, def, n.id) === 'overridden')
      ? 'overridden'
      : undefined
  const reset = (g: keyof NodeProps, def: PropDef) => {
    if (!page || !deviceId) return
    runAll(
      'reset override',
      targets
        .filter(
          (tg) =>
            !isDetachedAt(page, deviceId, tg.nodeId) && stateAt(g, def, tg.nodeId) === 'overridden',
        )
        .map((tg) => createResetPropCommand(tg, g, def.key)),
    )
  }

  return (
    <ColorEndContext.Provider value={() => history.breakCoalescing()}>
      <section aria-label={t.title} style={{ textAlign: 'left', fontSize: 12 }}>
        <h3 style={{ margin: '4px 0' }}>{t.title}</h3>
        {!first ? (
          <div>{t.empty}</div>
        ) : (
          <>
            {nodes.length > 1 ? (
              <div style={{ margin: '4px 0' }}>{t.multi(nodes.length)}</div>
            ) : (
              <div style={{ margin: '4px 0' }}>
                <strong>{first.name}</strong> ({t.category}: {first.category})
              </div>
            )}
            {deviceId && (
              <OverrideBar
                deviceName={doc.devices.find((d) => d.id === deviceId)?.name ?? ''}
                isBase={isBaseDevice(doc.devices, deviceId)}
                detached={detachedAll}
                language={language}
                onDetach={() => runAll('detach', targets.map(createDetachCommand))}
                onAttach={() => runAll('attach', targets.map(createAttachCommand))}
              />
            )}
            <div style={{ maxHeight: '70vh', overflow: 'auto', border: '1px solid var(--border)' }}>
              {PROP_GROUP_KEYS.map((g: keyof NodeProps) => {
                const defs = propRegistry
                  .forGroup(g)
                  .filter((d) => applicableNodes(nodes, d).length > 0)
                if (defs.length === 0) return null
                return (
                  <details key={g} open={g === 'size' || g === 'content' || g === 'appearance'}>
                    <summary style={{ cursor: 'pointer', padding: '2px 4px' }}>
                      {t.groups[g]}
                    </summary>
                    <div style={{ padding: '0 4px 4px' }}>
                      {defs.map((def) => {
                        const sv = shownValue(nodes, def)
                        return (
                          <label
                            key={`${idsKey}:${deviceId}:${g}.${def.key}`}
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
                              canReset={canReset}
                              onReset={() => reset(g, def)}
                            />
                            <PropControl
                              def={def}
                              value={sv.value}
                              mixed={sv.mixed}
                              language={language}
                              onCommit={(v, live) => set(def, v, live)}
                            />
                            <span />
                            <TokenPicker
                              def={def}
                              value={sv.value}
                              tokens={doc.tokens}
                              language={language}
                              onCommit={(v) => set(def, v)}
                            />
                            {g === 'typography' && def.key === 'fontFamily' && (
                              <>
                                <span />
                                <FontPicker
                                  assets={doc.assets}
                                  value={sv.value}
                                  language={language}
                                  onPick={(css) => set(def, css)}
                                />
                              </>
                            )}
                            {g === 'content' &&
                              def.key === 'href' &&
                              page &&
                              nodes.length === 1 &&
                              first && (
                                <LinkPicker
                                  doc={doc}
                                  page={page}
                                  href={sv.value}
                                  navMode={first.props.content.navMode}
                                  navTransition={first.props.content.navTransition}
                                  language={language}
                                  onHref={(v) => set(def, v)}
                                  onMeta={(key, v) =>
                                    deviceId &&
                                    history.execute(
                                      createPropsCommand({
                                        name: `inspector: ${key}`,
                                        pageId: page.id,
                                        deviceId,
                                        base: true,
                                        writes: [
                                          { nodeId: first.id, group: 'content', key, value: v },
                                        ],
                                      }),
                                    )
                                  }
                                />
                              )}
                            {g === 'content' && def.key === 'src' && (
                              <>
                                <span />
                                <AssetPicker
                                  assets={doc.assets}
                                  value={sv.value}
                                  language={language}
                                  canReplaceFile={!!sinks}
                                  onPick={(id) => set(def, `asset:${id}`)}
                                  onFile={(f) => void replaceFromFile(def, f)}
                                />
                              </>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </details>
                )
              })}
            </div>
          </>
        )}
      </section>
    </ColorEndContext.Provider>
  )
}
