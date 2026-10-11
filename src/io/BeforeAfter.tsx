import { useMemo, useState, type ReactNode } from 'react'
import type { Node } from '@/core'
import { wrapHtml } from './compare'

export type RenderAfter = (nodes: Node[], width: number, height: number) => ReactNode

type Props = {
  beforeHtml?: string | undefined // 取り込み元(HTML のみ)
  nodes: Node[]
  renderAfter: RenderAfter // After の描画は editor 側から注入(io は editor を参照できない)
  width: number
  language: 'ja' | 'en'
}

const TEXT = {
  ja: {
    title: '比較(Before / After)',
    side: '左右',
    slider: 'スライダー',
    before: '取り込み元',
    after: '取り込み後',
    noBefore: '取り込み元の描画は HTML のみ対応です',
  },
  en: {
    title: 'Compare (Before / After)',
    side: 'Side by side',
    slider: 'Slider',
    before: 'Source',
    after: 'Imported',
    noBefore: 'Source rendering is available for HTML only',
  },
} as const

const HEIGHT = 420

export function BeforeAfter({ beforeHtml, nodes, renderAfter, width, language }: Props) {
  const t = TEXT[language]
  const [mode, setMode] = useState<'side' | 'slider'>('side')
  const [pos, setPos] = useState(50)
  const before = useMemo(
    () => (beforeHtml !== undefined ? wrapHtml(beforeHtml) : undefined),
    [beforeHtml],
  )
  const frame = (html: string, title: string, extra: React.CSSProperties = {}) => (
    <iframe
      title={title}
      sandbox=""
      srcDoc={html}
      style={{
        width,
        height: HEIGHT,
        border: '1px solid var(--border)',
        background: '#fff',
        ...extra,
      }}
    />
  )

  const afterView = (extra: React.CSSProperties = {}) => (
    <div
      style={{
        width,
        height: HEIGHT,
        border: '1px solid var(--border)',
        overflow: 'hidden',
        ...extra,
      }}
    >
      {renderAfter(nodes, width, HEIGHT)}
    </div>
  )

  return (
    <section>
      <strong>{t.title}</strong>{' '}
      {before !== undefined && (
        <>
          <button type="button" disabled={mode === 'side'} onClick={() => setMode('side')}>
            {t.side}
          </button>{' '}
          <button type="button" disabled={mode === 'slider'} onClick={() => setMode('slider')}>
            {t.slider}
          </button>
        </>
      )}
      {before === undefined && <div>{t.noBefore}</div>}
      <div style={{ overflow: 'auto', maxWidth: '100%' }}>
        {before === undefined && afterView()}
        {before !== undefined && mode === 'side' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div>
              <small>{t.before}</small>
              <div>{frame(before, t.before)}</div>
            </div>
            <div>
              <small>{t.after}</small>
              <div>{afterView()}</div>
            </div>
          </div>
        )}
        {before !== undefined && mode === 'slider' && (
          <div>
            <input
              type="range"
              min={0}
              max={100}
              value={pos}
              aria-label={t.title}
              onChange={(e) => setPos(Number(e.target.value))}
            />{' '}
            <small>
              {t.before} | {t.after}
            </small>
            <div style={{ position: 'relative', width, height: HEIGHT }}>
              {frame(before, t.before, { position: 'absolute', inset: 0 })}
              {afterView({
                position: 'absolute',
                inset: 0,
                clipPath: `inset(0 0 0 ${pos}%)`,
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
