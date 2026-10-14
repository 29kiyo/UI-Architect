import { useState, type CSSProperties } from 'react'
import {
  addShadow,
  addStop,
  clampShadow,
  DEFAULT_GRADIENT,
  removeAt,
  removeStop,
  setTransformPart,
  updateAt,
  updateStop,
} from './editing'
import { LiveColor } from './LiveColor'
import {
  composeTransform,
  formatLinearGradient,
  formatShadows,
  parseLinearGradient,
  parseShadows,
  parseTransform,
  type Shadow,
  type ShadowKind,
  type TransformParts,
} from './values'

type Commit = (value: string, live?: boolean) => void

const ROW: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 2,
  alignItems: 'center',
  margin: '2px 0',
}
const NUMIN: CSSProperties = { width: 42, fontSize: 12, minWidth: 0 }
const HEX = /^#[0-9a-f]{6}$/i

// 数値入力。blur / Enter で確定(入力途中は保持)
function Num({
  value,
  onChange,
  label,
  step = 1,
}: {
  value: number
  onChange: (n: number) => void
  label: string
  step?: number
}) {
  const [draft, setDraft] = useState(String(value))
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    setPrev(value)
    setDraft(String(value))
  }
  const commit = () => {
    const n = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(n)) setDraft(String(value))
    else if (n !== value) onChange(n)
  }
  return (
    <input
      type="number"
      aria-label={label}
      title={label}
      step={step}
      value={draft}
      style={NUMIN}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setDraft(String(value))
      }}
    />
  )
}

function ColorBox({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (c: string, live: boolean) => void
  label: string
}) {
  return (
    <LiveColor
      label={label}
      value={HEX.test(value) ? value : '#000000'}
      width={24}
      onChange={(c) => onChange(c, true)}
    />
  )
}

export function ShadowEditor({
  value,
  kind,
  onCommit,
}: {
  value: unknown
  kind: ShadowKind
  onCommit: Commit
}) {
  const list = parseShadows(value, kind)
  if (!list) return null // 解析できない値はテキスト入力で編集
  const emit = (next: Shadow[], live = false) =>
    onCommit(formatShadows(next.map(clampShadow), kind), live)
  return (
    <div style={{ margin: '2px 0 4px' }}>
      {list.map((s, i) => (
        <div key={i} style={ROW}>
          <Num label="x" value={s.x} onChange={(n) => emit(updateAt(list, i, { x: n }))} />
          <Num label="y" value={s.y} onChange={(n) => emit(updateAt(list, i, { y: n }))} />
          <Num label="blur" value={s.blur} onChange={(n) => emit(updateAt(list, i, { blur: n }))} />
          {kind === 'box' && (
            <Num
              label="spread"
              value={s.spread}
              onChange={(n) => emit(updateAt(list, i, { spread: n }))}
            />
          )}
          <ColorBox
            label="color"
            value={s.color}
            onChange={(c, live) => emit(updateAt(list, i, { color: c }), live)}
          />
          {kind === 'box' && (
            <input
              type="checkbox"
              title="inset"
              aria-label="inset"
              checked={s.inset}
              onChange={(e) => emit(updateAt(list, i, { inset: e.target.checked }))}
            />
          )}
          <button type="button" aria-label="remove shadow" onClick={() => emit(removeAt(list, i))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => emit(addShadow(list))}>
        + shadow
      </button>
    </div>
  )
}

export function GradientEditor({ value, onCommit }: { value: unknown; onCommit: Commit }) {
  const g = parseLinearGradient(value)
  if (!g) {
    // グラデーションでない(none / url など)ときは追加ボタンだけ出す
    const plain = value === undefined || value === '' || value === 'none'
    return plain ? (
      <button type="button" onClick={() => onCommit(formatLinearGradient(DEFAULT_GRADIENT))}>
        + gradient
      </button>
    ) : null
  }
  const emit = (next: typeof g, live = false) => onCommit(formatLinearGradient(next), live)
  return (
    <div style={{ margin: '2px 0 4px' }}>
      <div style={ROW}>
        <span>angle</span>
        <Num label="angle" value={g.angle} onChange={(n) => emit({ ...g, angle: n })} />
        <button type="button" onClick={() => onCommit('none')}>
          ×
        </button>
      </div>
      {g.stops.map((s, i) => (
        <div key={i} style={ROW}>
          <ColorBox
            label="stop color"
            value={s.color}
            onChange={(c, live) => emit(updateStop(g, i, { color: c }), live)}
          />
          <Num
            label="stop %"
            value={s.pos ?? (g.stops.length > 1 ? (i / (g.stops.length - 1)) * 100 : 0)}
            onChange={(n) => emit(updateStop(g, i, { pos: n }))}
          />
          <button type="button" aria-label="remove stop" onClick={() => emit(removeStop(g, i))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => emit(addStop(g))}>
        + stop
      </button>
    </div>
  )
}

const T_FIELDS: [keyof TransformParts, string, number][] = [
  ['translateX', 'X px', 1],
  ['translateY', 'Y px', 1],
  ['rotate', 'rotate°', 1],
  ['scaleX', 'scaleX', 0.1],
  ['scaleY', 'scaleY', 0.1],
  ['skewX', 'skewX°', 1],
  ['skewY', 'skewY°', 1],
]

export function TransformEditor({ value, onCommit }: { value: unknown; onCommit: Commit }) {
  const t = parseTransform(value)
  if (!t) return null // 順序違い・matrix などはテキスト入力で編集
  return (
    <div style={{ margin: '2px 0 4px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {T_FIELDS.map(([k, label, step]) => (
        <label key={k} style={{ display: 'flex', flexDirection: 'column', fontSize: 10 }}>
          {label}
          <Num
            label={label}
            step={step}
            value={t[k]}
            onChange={(n) => onCommit(composeTransform(setTransformPart(t, k, n)))}
          />
        </label>
      ))}
    </div>
  )
}
