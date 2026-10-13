import { useState, type CSSProperties } from 'react'
import { normalizeInput } from './commit'
import { GradientEditor, ShadowEditor, TransformEditor } from './editors'
import type { PropDef } from './registry'
import { formatLength, parseLength } from './values'

// live=true は連続変更中(色ピッカーなど)。呼び出し側が 1 履歴にまとめる
export type OnCommit = (value: string | number, live?: boolean) => void

type CtlProps = {
  def: PropDef
  value: unknown
  onCommit: OnCommit
  language: 'ja' | 'en'
}

const FIELD: CSSProperties = { width: '100%', boxSizing: 'border-box', minWidth: 0, fontSize: 12 }
const KEYWORDS = new Set(['auto', 'none', 'normal'])

const asString = (v: unknown): string => (v === undefined || v === null ? '' : String(v))

// 入力途中の文字列を保持する。外部の値が変わったら(Undo 等)入力欄も追従する
function useDraft(value: unknown): [string, (s: string) => void, string] {
  const str = asString(value)
  const [draft, setDraft] = useState(str)
  const [prev, setPrev] = useState(str)
  if (prev !== str) {
    setPrev(str)
    setDraft(str)
  }
  return [draft, setDraft, str]
}

// text / number / length / color の文字入力。blur か Enter で確定
function TextLike({ def, value, onCommit, type }: CtlProps & { type?: 'number' | 'text' }) {
  const [draft, setDraft, str] = useDraft(value)
  const commit = () => {
    const v = normalizeInput(def, draft)
    if (v === undefined) setDraft(str)
    else if (asString(v) !== str) onCommit(v)
    else setDraft(str)
  }
  return (
    <input
      type={type ?? 'text'}
      value={draft}
      {...(def.type === 'number'
        ? {
            step: def.step ?? 1,
            ...(def.min !== undefined ? { min: def.min } : {}),
            ...(def.max !== undefined ? { max: def.max } : {}),
          }
        : {})}
      style={FIELD}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(str)
      }}
    />
  )
}

export function NumberControl(p: CtlProps) {
  return <TextLike {...p} type="number" />
}

export function TextControl(p: CtlProps) {
  return <TextLike {...p} />
}

export function LengthControl(p: CtlProps) {
  const { def, value, onCommit } = p
  const parsed = parseLength(value)
  const current = parsed ? ('keyword' in parsed ? parsed.keyword : parsed.unit) : ''
  const units = def.units ?? []
  const options = !parsed || units.includes(current) ? units : [...units, current]
  return (
    <span style={{ display: 'flex', gap: 2 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <TextLike {...p} />
      </span>
      <select
        aria-label={`${def.key} unit`}
        value={current}
        style={{ width: 54, fontSize: 12 }}
        onChange={(e) => {
          const u = e.target.value
          if (KEYWORDS.has(u)) onCommit(u)
          else
            onCommit(
              formatLength({ value: parsed && 'value' in parsed ? parsed.value : 0, unit: u }),
            )
        }}
      >
        {!parsed && <option value="">—</option>}
        {options.map((u) => (
          <option key={u} value={u}>
            {u || '—'}
          </option>
        ))}
      </select>
    </span>
  )
}

export function SelectControl({ def, value, onCommit, language }: CtlProps) {
  const cur = asString(value)
  const opts = def.options ?? []
  const known = opts.some((o) => o.value === cur)
  return (
    <select
      value={cur}
      style={FIELD}
      onChange={(e) => {
        if (e.target.value !== '') onCommit(e.target.value)
      }}
    >
      {cur === '' && <option value="">—</option>}
      {!known && cur !== '' && <option value={cur}>{cur}</option>}
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label[language]}
        </option>
      ))}
    </select>
  )
}

const HEX = /^#[0-9a-f]{6}$/i

export function ColorControl(p: CtlProps) {
  const cur = asString(p.value)
  return (
    <span style={{ display: 'flex', gap: 2 }}>
      <input
        type="color"
        aria-label={`${p.def.key} picker`}
        value={HEX.test(cur) ? cur : '#000000'}
        style={{ width: 28, padding: 0, flexShrink: 0 }}
        onChange={(e) => p.onCommit(e.target.value, true)}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <TextLike {...p} />
      </span>
    </span>
  )
}

// 専用エディタ(あれば)。テキスト欄は常に残し、解析できない値でも編集できるようにする
function Special({ def, value, onCommit }: CtlProps) {
  const id = `${def.group}.${def.key}`
  if (id === 'shadow.boxShadow')
    return <ShadowEditor value={value} kind="box" onCommit={onCommit} />
  if (id === 'shadow.textShadow')
    return <ShadowEditor value={value} kind="text" onCommit={onCommit} />
  if (id === 'appearance.backgroundImage')
    return <GradientEditor value={value} onCommit={onCommit} />
  if (id === 'transform.transform') return <TransformEditor value={value} onCommit={onCommit} />
  return null
}

// 種別 → コントロール
export function PropControl(p: CtlProps) {
  return (
    <>
      <BasicControl {...p} />
      <Special {...p} />
    </>
  )
}

function BasicControl(p: CtlProps) {
  switch (p.def.type) {
    case 'number':
      return <NumberControl {...p} />
    case 'length':
      return <LengthControl {...p} />
    case 'select':
      return <SelectControl {...p} />
    case 'color':
      return <ColorControl {...p} />
    default:
      return <TextControl {...p} />
  }
}
