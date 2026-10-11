import { rulerTicks } from './rulerTicks'
import type { Viewport } from './viewport'

const SIZE = 16
const strip = {
  position: 'absolute',
  pointerEvents: 'none',
  background: 'var(--bg)',
} as const
const text = { fontSize: 9, fill: 'var(--text)' }

// 上端・左端の定規(値はワールド座標)。操作は受け付けない
export function Ruler({ viewport }: { viewport: Viewport }) {
  const xs = rulerTicks(viewport.zoom, viewport.panX)
  const ys = rulerTicks(viewport.zoom, viewport.panY)
  return (
    <>
      <svg
        aria-hidden="true"
        width="100%"
        height={SIZE}
        style={{ ...strip, left: 0, top: 0, borderBottom: '1px solid var(--border)' }}
      >
        {xs.map((t) => (
          <g key={t.value}>
            <line x1={t.screen} y1={SIZE - 6} x2={t.screen} y2={SIZE} stroke="var(--text)" />
            <text x={t.screen + 2} y={9} style={text}>
              {t.value}
            </text>
          </g>
        ))}
      </svg>
      <svg
        aria-hidden="true"
        width={SIZE}
        height="100%"
        style={{ ...strip, left: 0, top: 0, borderRight: '1px solid var(--border)' }}
      >
        {ys.map((t) => (
          <g key={t.value}>
            <line x1={SIZE - 6} y1={t.screen} x2={SIZE} y2={t.screen} stroke="var(--text)" />
            <text transform={'translate(9 ' + (t.screen - 2) + ') rotate(-90)'} style={text}>
              {t.value}
            </text>
          </g>
        ))}
      </svg>
    </>
  )
}
