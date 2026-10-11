import { memo } from 'react'
import { resolveNode } from '@/core'
import type { Page } from '@/core'
import { nodeStyle } from './style'

type Props = { page: Page; deviceId: string; nodeId: string; depth?: number }

const MAX_DEPTH = 200
const PLACEHOLDER = '#e5e5e5'
// SVG は <img> 経由で描画する(キャンバス内でスクリプトを実行させない)
const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

// デバイス別の実効値で1ノードを DOM 描画する(子は再帰)
export const NodeView = memo(function NodeView({ page, deviceId, nodeId, depth = 0 }: Props) {
  if (depth > MAX_DEPTH) return null
  const n = resolveNode(page, deviceId, nodeId)
  if (!n) return null
  const style = nodeStyle(n)
  const c = n.props.content

  if (n.type === 'text') {
    return (
      <span data-node-id={n.id} style={style}>
        {String(c.text ?? '')}
      </span>
    )
  }
  if (n.type === 'image') {
    const src = typeof c.src === 'string' && c.src.startsWith('data:') ? c.src : undefined
    return src ? (
      <img
        data-node-id={n.id}
        src={src}
        alt={String(c.alt ?? '')}
        draggable={false}
        style={style}
      />
    ) : (
      <div data-node-id={n.id} style={{ background: PLACEHOLDER, ...style }} />
    )
  }
  if (n.type === 'svg') {
    return typeof c.svg === 'string' ? (
      <img data-node-id={n.id} src={svgDataUrl(c.svg)} alt="" draggable={false} style={style} />
    ) : (
      <div data-node-id={n.id} style={{ background: PLACEHOLDER, ...style }} />
    )
  }
  return (
    <div data-node-id={n.id} style={style}>
      {typeof c.text === 'string' ? c.text : null}
      {n.children.map((id) => (
        <NodeView key={id} page={page} deviceId={deviceId} nodeId={id} depth={depth + 1} />
      ))}
    </div>
  )
})
