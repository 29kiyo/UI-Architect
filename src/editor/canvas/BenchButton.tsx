import { useState } from 'react'
import { createUpdateDeviceCommand, type History, type UIDocument } from '@/core'
import { buildLargePage } from './bench'
import { createPropsCommand } from './commands'

type Props = { doc: UIDocument; history: History; replace: (d: UIDocument) => void }

// 開発時のみ: 1000 ノードに差し替えて、再描画と更新の時間を測る
export function BenchButton({ doc, history, replace }: Props) {
  const [out, setOut] = useState('')
  const frame = () => new Promise<number>((r) => requestAnimationFrame(() => r(performance.now())))

  const run = async () => {
    const page = buildLargePage(1000)
    const t0 = performance.now()
    replace({ ...doc, pages: [page] })
    await frame()
    await frame()
    const render = performance.now() - t0

    const ids = Object.keys(page.nodes)
    const target = ids[500]!
    const dev = doc.devices[0]!.id
    const samples: number[] = []
    for (let i = 0; i < 30; i++) {
      const t = performance.now()
      history.execute(
        createPropsCommand({
          name: 'move',
          pageId: page.id,
          deviceId: dev,
          base: true,
          writes: [{ nodeId: target, group: 'position', key: 'left', value: `${i}px` }],
          coalesceKey: 'bench',
        }),
      )
      await frame()
      samples.push(performance.now() - t)
    }
    samples.sort((a, b) => a - b)
    const med = samples[15]!
    const p95 = samples[28]!
    void createUpdateDeviceCommand
    setOut(
      `nodes=${ids.length} / 初回描画 ${render.toFixed(0)}ms / 移動1回(更新→描画) 中央値 ${med.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms`,
    )
  }

  return (
    <span>
      <button type="button" onClick={() => void run()}>
        [dev] 1000ノード計測
      </button>{' '}
      <small>{out}</small>
    </span>
  )
}
