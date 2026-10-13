import { useState } from 'react'
import type { History, Tokens } from '@/core'
import { findTokenByRef, TOKEN_KINDS, tokenRef, type TokenKind } from '../canvas/tokenVars'
import type { PropDef } from './registry'
import { createRemoveTokenCommand, createSetTokenCommand } from './tokenCommands'

type Lang = 'ja' | 'en'

// このプロパティで使えるトークン種別(無ければ選択欄を出さない)
export function tokenKindFor(def: PropDef): TokenKind | undefined {
  if (def.group === 'typography' && def.key === 'fontFamily') return 'fonts'
  if (def.type === 'color') return 'colors'
  if (def.type === 'length') return 'spacing'
  return undefined
}

const TEXT = {
  ja: {
    pick: 'トークン',
    none: '(使わない)',
    missing: '(未定義)',
    title: 'トークン',
    kinds: { colors: '色', spacing: '余白', fonts: 'フォント' },
    name: '名前',
    value: '値',
    add: '追加',
    remove: '削除',
  },
  en: {
    pick: 'Token',
    none: '(none)',
    missing: '(undefined)',
    title: 'Tokens',
    kinds: { colors: 'Colors', spacing: 'Spacing', fonts: 'Fonts' },
    name: 'Name',
    value: 'Value',
    add: 'Add',
    remove: 'Remove',
  },
} as const

const MISSING = '\u0000missing'
const REF_RE = /^var\(--token-(colors|spacing|fonts)-[^)]*\)$/

type PickProps = {
  def: PropDef
  value: unknown
  tokens: Tokens
  language: Lang
  onCommit: (value: string) => void
}

export function TokenPicker({ def, value, tokens, language, onCommit }: PickProps) {
  const kind = tokenKindFor(def)
  if (!kind) return null
  const t = TEXT[language]
  const names = Object.keys(tokens[kind])
  const found = findTokenByRef(tokens, value)
  const isRef = typeof value === 'string' && REF_RE.test(value.trim())
  const missing = isRef && !found
  if (names.length === 0 && !isRef) return null
  const current = found && found.kind === kind ? found.name : missing ? MISSING : ''
  return (
    <select
      aria-label={`${def.key} ${t.pick}`}
      title={t.pick}
      value={current}
      style={{ width: '100%', fontSize: 11, marginTop: 2 }}
      onChange={(e) => {
        const v = e.target.value
        if (v === '' || v === MISSING) return
        onCommit(tokenRef(kind, v))
      }}
    >
      <option value="">
        {t.pick}: {t.none}
      </option>
      {missing && <option value={MISSING}>{t.missing}</option>}
      {names.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  )
}

function ValueInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    setPrev(value)
    setDraft(value)
  }
  const commit = () => {
    const v = draft.trim()
    if (v === '' || /[;{}<>]/.test(v)) setDraft(value)
    else if (v !== value) onCommit(v)
  }
  return (
    <input
      value={draft}
      style={{ flex: 1, minWidth: 0, fontSize: 12 }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(value)
      }}
    />
  )
}

type PanelProps = { tokens: Tokens; history: History; language: Lang }

export function TokenPanel({ tokens, history, language }: PanelProps) {
  const t = TEXT[language]
  const [kind, setKind] = useState<TokenKind>('colors')
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const entries = Object.entries(tokens[kind])
  const canAdd =
    name.trim() !== '' &&
    value.trim() !== '' &&
    !/[;{}<>]/.test(value) &&
    !(name.trim() in tokens[kind])
  const add = () => {
    if (!canAdd) return
    history.execute(createSetTokenCommand(kind, name, value.trim()))
    setName('')
    setValue('')
  }
  return (
    <section aria-label={t.title} style={{ textAlign: 'left', fontSize: 12, marginTop: 8 }}>
      <h3 style={{ margin: '4px 0' }}>{t.title}</h3>
      <select
        aria-label={t.title}
        value={kind}
        onChange={(e) => setKind(e.target.value as TokenKind)}
      >
        {TOKEN_KINDS.map((k) => (
          <option key={k} value={k}>
            {t.kinds[k]}
          </option>
        ))}
      </select>
      {entries.map(([n, v]) => (
        <div key={`${kind}:${n}`} style={{ display: 'flex', gap: 2, margin: '2px 0' }}>
          <span style={{ width: 70, overflow: 'hidden', textOverflow: 'ellipsis' }} title={n}>
            {n}
          </span>
          <ValueInput
            value={v}
            onCommit={(nv) => history.execute(createSetTokenCommand(kind, n, nv))}
          />
          <button
            type="button"
            aria-label={t.remove}
            title={t.remove}
            onClick={() => history.execute(createRemoveTokenCommand(kind, n))}
          >
            ×
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 2, margin: '4px 0' }}>
        <input
          placeholder={t.name}
          value={name}
          style={{ width: 70, fontSize: 12 }}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder={t.value}
          value={value}
          style={{ flex: 1, minWidth: 0, fontSize: 12 }}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button type="button" disabled={!canAdd} onClick={add}>
          {t.add}
        </button>
      </div>
    </section>
  )
}
