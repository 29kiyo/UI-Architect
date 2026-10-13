import type { OverrideState } from './overrideCommands'

type Lang = 'ja' | 'en'

const TEXT = {
  ja: {
    overridden: 'このデバイスのみ',
    reset: '共通に戻す',
    device: '編集中のデバイス',
    detach: '共有から切り離す',
    attach: '共有に戻す',
    detached: '切り離し中(共有の変更に追従しません)',
    shared: '共通値を編集中',
  },
  en: {
    overridden: 'This device only',
    reset: 'Reset to shared',
    device: 'Editing device',
    detach: 'Detach from shared',
    attach: 'Attach to shared',
    detached: 'Detached (ignores shared changes)',
    shared: 'Editing shared values',
  },
} as const

type LabelProps = {
  label: string
  state: OverrideState | undefined // undefined は印なし(基準デバイスで未上書き等)
  canReset: boolean
  language: Lang
  onReset: () => void
}

export function PropLabel({ label, state, canReset, language, onReset }: LabelProps) {
  const t = TEXT[language]
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      {state === 'overridden' && (
        <span title={t.overridden} style={{ color: 'var(--accent)' }}>
          ●
        </span>
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{label}</span>
      {state === 'overridden' && canReset && (
        <button
          type="button"
          title={t.reset}
          aria-label={t.reset}
          style={{ padding: '0 3px', fontSize: 11 }}
          onClick={(e) => {
            e.preventDefault()
            onReset()
          }}
        >
          ↺
        </button>
      )}
    </span>
  )
}

type BarProps = {
  deviceName: string
  isBase: boolean
  detached: boolean
  language: Lang
  onDetach: () => void
  onAttach: () => void
}

export function OverrideBar({
  deviceName,
  isBase,
  detached,
  language,
  onDetach,
  onAttach,
}: BarProps) {
  const t = TEXT[language]
  return (
    <div
      style={{ margin: '4px 0', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}
    >
      <span>
        {t.device}: <strong>{deviceName}</strong>
        {isBase ? ` (${t.shared})` : ''}
      </span>
      {!isBase && (
        <>
          {detached && <span style={{ color: 'var(--accent)' }}>{t.detached}</span>}
          <button type="button" onClick={detached ? onAttach : onDetach}>
            {detached ? t.attach : t.detach}
          </button>
        </>
      )}
    </div>
  )
}
