import type { Artboard } from './artboard'
import type { Viewport, WorldRect } from './viewport'

type Props = {
  viewport: Viewport
  artboards: Artboard[]
  selected?: WorldRect[] | undefined
  hover?: WorldRect | undefined
  marquee?: WorldRect | undefined
}

// 選択枠・ホバー枠・矩形選択の重ねレイヤー(5-C 以降でハンドル/ガイドを追加)
export function CanvasOverlay({ viewport, artboards, selected = [], hover, marquee }: Props) {
  return (
    <svg
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <g transform={`translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`}>
        {artboards.map((a) => (
          <rect
            key={a.deviceId}
            x={a.rect.x}
            y={a.rect.y}
            width={a.rect.width}
            height={a.rect.height}
            fill="none"
            stroke="var(--border)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {hover && (
          <rect
            x={hover.x}
            y={hover.y}
            width={hover.width}
            height={hover.height}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {selected.map((r, i) => (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
            fill="var(--accent-bg)"
            stroke="var(--accent)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {marquee && (
          <rect
            x={marquee.x}
            y={marquee.y}
            width={marquee.width}
            height={marquee.height}
            fill="var(--accent-bg)"
            stroke="var(--accent)"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </g>
    </svg>
  )
}
