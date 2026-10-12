import { useMemo, useState } from 'react'
import { filterCommands, type PaletteCommand } from './commandList'

type Props = { commands: PaletteCommand[]; language: 'ja' | 'en'; onClose: () => void }

const TEXT = {
  ja: {
    title: 'コマンドパレット',
    placeholder: 'コマンドを検索(↑↓ で選択、Enter で実行)',
    empty: '(該当なし)',
  },
  en: {
    title: 'Command palette',
    placeholder: 'Search commands (↑↓ to select, Enter to run)',
    empty: '(no match)',
  },
} as const

export function CommandPalette({ commands, language, onClose }: Props) {
  const t = TEXT[language]
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const list = useMemo(() => filterCommands(commands, query), [commands, query])
  const run = (c: PaletteCommand | undefined) => {
    if (!c || !c.enabled) return
    onClose()
    c.run()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '15vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 92vw)',
          textAlign: 'left',
          background: 'var(--bg, #fff)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 8,
        }}
      >
        <input
          autoFocus
          value={query}
          placeholder={t.placeholder}
          aria-label={t.placeholder}
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => Math.min(i + 1, Math.max(0, list.length - 1)))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') run(list[index])
          }}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
        <div role="listbox" style={{ maxHeight: '50vh', overflow: 'auto', marginTop: 6 }}>
          {list.length === 0 && <div style={{ padding: 4 }}>{t.empty}</div>}
          {list.map((c, i) => (
            <div
              key={c.id}
              role="option"
              aria-selected={i === index}
              aria-disabled={!c.enabled}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(c)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 8px',
                cursor: c.enabled ? 'pointer' : 'default',
                opacity: c.enabled ? 1 : 0.4,
                background: i === index ? 'var(--accent-bg)' : 'transparent',
              }}
            >
              <span>{c.label}</span>
              <small style={{ fontFamily: 'var(--mono)' }}>{c.keys ?? ''}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
