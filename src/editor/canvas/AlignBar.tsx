import { useState, type RefObject } from 'react'
import { getParentId, type History, type Page, type UIDocument } from '@/core'
import { alignEligible } from './align'
import { runAlign, runAutoLayout, type AlignOp } from './alignActions'
import { useSelection } from './selection'
import type { Viewport } from './viewport'

type Props = {
  doc: UIDocument
  page: Page | undefined
  history: History
  containerRef: RefObject<HTMLDivElement | null>
  vp: Viewport
  language: 'ja' | 'en'
}

const TEXT = {
  ja: {
    align: '整列',
    ops: {
      left: '左揃え',
      hcenter: '左右中央',
      right: '右揃え',
      top: '上揃え',
      vcenter: '上下中央',
      bottom: '下揃え',
      'distribute-h': '横に等間隔',
      'distribute-v': '縦に等間隔',
    },
    auto: 'オートレイアウト化',
    hint: '整列は absolute/relative の要素を 2 つ以上(等間隔は 3 つ以上)選択',
    ineligible: 'オートレイアウト化できません(同じ親の兄弟を 2 つ以上、ロックなしで選択)',
    noEstimate: '行・列・グリッドに見える配置ではないため、適用しませんでした',
  },
  en: {
    align: 'Align',
    ops: {
      left: 'Left',
      hcenter: 'Center H',
      right: 'Right',
      top: 'Top',
      vcenter: 'Center V',
      bottom: 'Bottom',
      'distribute-h': 'Distribute H',
      'distribute-v': 'Distribute V',
    },
    auto: 'Auto layout',
    hint: 'Select 2+ absolute/relative nodes (3+ to distribute)',
    ineligible: 'Cannot apply (select 2+ unlocked siblings with the same parent)',
    noEstimate: 'The arrangement does not look like a row, column or grid',
  },
} as const

const OPS: AlignOp[] = [
  'left',
  'hcenter',
  'right',
  'top',
  'vcenter',
  'bottom',
  'distribute-h',
  'distribute-v',
]

export function AlignBar({ doc, page, history, containerRef, vp, language }: Props) {
  const t = TEXT[language]
  const selectedIds = useSelection((s) => s.selectedIds)
  const activeDeviceId = useSelection((s) => s.activeDeviceId)
  const [notice, setNotice] = useState('')
  const deviceId = activeDeviceId ?? doc.devices[0]?.id
  const ids = page ? selectedIds.filter((id) => id in page.nodes && id !== page.rootNodeId) : []
  const canAlign = !!page && !!deviceId && alignEligible(page, deviceId, ids)
  const canAuto =
    !!page &&
    ids.length >= 2 &&
    new Set(ids.map((id) => getParentId(page, id))).size === 1 &&
    ids.every((id) => !page.nodes[id]?.locked)

  const env = () => (page ? { doc, page, history } : undefined)
  const align = (op: AlignOp) => {
    const e = env()
    const el = containerRef.current
    if (e && el) runAlign(e, el, vp, op)
  }
  const auto = () => {
    const e = env()
    const el = containerRef.current
    if (!e || !el) return
    const r = runAutoLayout(e, el, vp)
    setNotice(r === 'ok' ? '' : r === 'no-estimate' ? t.noEstimate : t.ineligible)
  }

  return (
    <div style={{ margin: '4px 0' }}>
      <strong>{t.align}</strong>{' '}
      {OPS.map((op) => (
        <button
          key={op}
          type="button"
          title={t.ops[op]}
          disabled={!canAlign || (op.startsWith('distribute') && ids.length < 3)}
          onClick={() => align(op)}
        >
          {t.ops[op]}
        </button>
      ))}{' '}
      <button type="button" disabled={!canAuto} onClick={auto}>
        {t.auto}
      </button>{' '}
      <small>{notice || t.hint}</small>
    </div>
  )
}
