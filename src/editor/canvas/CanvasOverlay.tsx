import type { Artboard } from './artboard'
import { HANDLE_CURSOR, HANDLE_IDS, handlePoint, type Line } from './transform'
import type { Viewport, WorldRect } from './viewport'

export type HandleInfo = { rect: WorldRect; rotated: boolean }

type Props = {
  viewport: Viewport
  artboards: Artboard[]
  selected?: WorldRect[] | undefined
  hover?: WorldRect | undefined
  marquee?: WorldRect | undefined
  handles?: HandleInfo | undefined
  drop?: Line | undefined
  guides?: Line[] | undefined
  safe?: WorldRect[] | undefined
}

// 選択枠・ホバー枠・矩形選択の重ねレイヤー(5-C 以降でハンドル/ガイドを追加)
export function CanvasOverlay({
  viewport,
  artboards,
  selected = [],
  hover,
  marquee,
  handles,
  drop,
  guides = [],
  safe = [],
}: Props) {
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
        {safe.map((r, i) => (
          <rect
            key={'safe-' + i}
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
            fill="rgba(255,140,0,0.22)"
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
        {guides.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="#ff2d9b"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {drop && (
          <line
            x1={drop.x1}
            y1={drop.y1}
            x2={drop.x2}
            y2={drop.y2}
            stroke="var(--accent)"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {handles && <Handles info={handles} zoom={viewport.zoom} />}
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

// 8 方向のリサイズハンドルと回転ハンドル(画面上のサイズは一定)。操作は Canvas 側の pointerdown で処理
function Handles({ info, zoom }: { info: HandleInfo; zoom: number }) {
  const s = 8 / zoom
  const top = handlePoint(info.rect, 'n')
  const rot = { x: top.x, y: top.y - 24 / zoom }
  return (
    <g>
      <line
        x1={top.x}
        y1={top.y}
        x2={rot.x}
        y2={rot.y}
        stroke="var(--accent)"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        data-handle="rotate"
        cx={rot.x}
        cy={rot.y}
        r={5 / zoom}
        fill="var(--bg)"
        stroke="var(--accent)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: 'all', cursor: 'grab' }}
      />
      {!info.rotated &&
        HANDLE_IDS.map((h) => {
          const p = handlePoint(info.rect, h)
          return (
            <rect
              key={h}
              data-handle={h}
              x={p.x - s / 2}
              y={p.y - s / 2}
              width={s}
              height={s}
              fill="var(--bg)"
              stroke="var(--accent)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: 'all', cursor: HANDLE_CURSOR[h] }}
            />
          )
        })}
    </g>
  )
}
