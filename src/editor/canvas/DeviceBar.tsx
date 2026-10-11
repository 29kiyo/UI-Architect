import { useState } from 'react'
import { createUpdateDeviceCommand, deviceSize, type History, type UIDocument } from '@/core'
import { selectionStore, useSelection } from './selection'

type Props = {
  doc: UIDocument
  history: History
  view: string
  setView: (v: string) => void
  frame: boolean
  setFrame: (v: boolean) => void
  safeOn: boolean
  setSafeOn: (v: boolean) => void
  language: 'ja' | 'en'
}

const PRESETS = {
  none: { top: 0, right: 0, bottom: 0, left: 0 },
  notch: { top: 47, right: 0, bottom: 34, left: 0 },
  android: { top: 24, right: 0, bottom: 0, left: 0 },
} as const
type Safe = { top: number; right: number; bottom: number; left: number }

const presetOf = (s: Safe): string =>
  Object.entries(PRESETS).find(
    ([, p]) => p.top === s.top && p.right === s.right && p.bottom === s.bottom && p.left === s.left,
  )?.[0] ?? 'custom'

const TEXT = {
  ja: {
    device: 'デバイス',
    show: '表示',
    all: '全部並べる',
    target: '対象',
    rotate: '回転',
    safe: 'セーフエリア',
    presets: {
      none: 'なし',
      notch: 'ノッチ付き(上47/下34)',
      android: 'Android(上24)',
      custom: 'カスタム',
    },
    frame: '端末フレーム',
    safeShow: 'セーフエリア表示',
  },
  en: {
    device: 'Device',
    show: 'View',
    all: 'All side by side',
    target: 'Target',
    rotate: 'Rotate',
    safe: 'Safe area',
    presets: {
      none: 'None',
      notch: 'Notch (top 47 / bottom 34)',
      android: 'Android (top 24)',
      custom: 'Custom',
    },
    frame: 'Device frame',
    safeShow: 'Show safe area',
  },
} as const

export function DeviceBar({
  doc,
  history,
  view,
  setView,
  frame,
  setFrame,
  safeOn,
  setSafeOn,
  language,
}: Props) {
  const t = TEXT[language]
  const active = useSelection((s) => s.activeDeviceId)
  const [picked, setPicked] = useState('')
  const target =
    doc.devices.find((d) => d.id === picked) ??
    doc.devices.find((d) => d.id === active) ??
    doc.devices[0]
  const size = target ? deviceSize(target) : undefined
  const preset = target ? presetOf(target.safeArea) : 'none'

  return (
    <div style={{ margin: '4px 0' }}>
      <strong>{t.device}</strong>{' '}
      <label>
        {t.show}{' '}
        <select
          value={view}
          onChange={(e) => {
            selectionStore.getState().clear()
            setView(e.target.value)
          }}
        >
          <option value="all">{t.all}</option>
          {doc.devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        {t.target}{' '}
        <select value={target?.id ?? ''} onChange={(e) => setPicked(e.target.value)}>
          {doc.devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>{' '}
      {target && size && (
        <>
          <button
            type="button"
            onClick={() =>
              history.execute(
                createUpdateDeviceCommand(
                  target.id,
                  { orientation: target.orientation === 'landscape' ? 'portrait' : 'landscape' },
                  'rotate-device',
                ),
              )
            }
          >
            {t.rotate} ({size.width}×{size.height})
          </button>{' '}
          <label>
            {t.safe}{' '}
            <select
              value={preset}
              onChange={(e) => {
                const p = PRESETS[e.target.value as keyof typeof PRESETS]
                if (p) {
                  history.execute(
                    createUpdateDeviceCommand(target.id, { safeArea: { ...p } }, 'safe-area'),
                  )
                }
              }}
            >
              {(Object.keys(t.presets) as (keyof typeof t.presets)[]).map((k) => (
                <option key={k} value={k} disabled={k === 'custom'}>
                  {t.presets[k]}
                </option>
              ))}
            </select>
          </label>{' '}
        </>
      )}
      <label>
        <input type="checkbox" checked={frame} onChange={(e) => setFrame(e.target.checked)} />{' '}
        {t.frame}
      </label>{' '}
      <label>
        <input type="checkbox" checked={safeOn} onChange={(e) => setSafeOn(e.target.checked)} />{' '}
        {t.safeShow}
      </label>
    </div>
  )
}
