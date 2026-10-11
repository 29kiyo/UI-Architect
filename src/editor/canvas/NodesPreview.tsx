import { useMemo } from 'react'
import type { Node } from '@/core'
import { NodeView } from './NodeView'
import { PREVIEW_DEVICE_ID, previewPage } from './preview'

type Props = { nodes: Node[]; width: number; height: number }

// 取り込み前の Node[] をキャンバスと同じ描画(NodeView)で表示する
export function NodesPreview({ nodes, width, height }: Props) {
  const page = useMemo(() => previewPage(nodes), [nodes])
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'auto',
        background: '#fff',
        color: '#000',
        contain: 'layout paint', // position:fixed 等がはみ出さないようにする
      }}
    >
      {page && <NodeView page={page} deviceId={PREVIEW_DEVICE_ID} nodeId={page.rootNodeId} />}
    </div>
  )
}
