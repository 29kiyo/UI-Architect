import type { CSSProperties } from 'react'
import type { Master } from '@/core'
import { NodeView } from './NodeView'

type Props = { master: Master; deviceId: string; flow?: boolean }

// ページ編集中に合成表示するマスター(薄く表示し、クリックは通す。編集はマスター編集モードで)
export function MasterLayer({ master, deviceId, flow = false }: Props) {
  const layout: CSSProperties = flow
    ? { position: 'relative', flex: 'none' }
    : { position: 'absolute', inset: 0 }
  return (
    <div
      aria-hidden
      data-master-id={master.id}
      style={{ pointerEvents: 'none', opacity: 0.65, ...layout }}
    >
      <NodeView page={master} deviceId={deviceId} nodeId={master.rootNodeId} />
    </div>
  )
}
