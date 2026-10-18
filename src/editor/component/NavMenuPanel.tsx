import { useState } from 'react'
import {
  createMobileMenuCommand,
  findEditablePage,
  navMenuBlocker,
  newId,
  type History,
  type UIDocument,
} from '@/core'
import { selectionStore, useSelection } from '../canvas/selection'

type Props = {
  doc: UIDocument
  history: History
  pageId: string | undefined
  language: 'ja' | 'en'
}

const TEXT = {
  ja: {
    title: 'スマホ用メニュー',
    device: 'スマホ側のデバイス',
    make: 'スマホ用メニューを生成',
    note: 'ナビはそのデバイスで非表示になり、☰ ボタンが出ます(開閉の動作は Phase 9)',
    done: (v: string) => `生成済みです(変数: ${v})`,
    blocked: {
      missing: '要素が見つかりません',
      'not-nav': 'ナビゲーションの要素を選択してください',
      exists: '生成済みです',
      'base-device': '基準デバイスは選べません',
      'no-parent': '親が見つかりません',
    },
  },
  en: {
    title: 'Mobile menu',
    device: 'Mobile device',
    make: 'Generate mobile menu',
    note: 'The nav is hidden on that device and a ☰ button appears (toggle runs in Phase 9)',
    done: (v: string) => `Already generated (variable: ${v})`,
    blocked: {
      missing: 'Node not found',
      'not-nav': 'Select a navigation element',
      exists: 'Already generated',
      'base-device': 'Cannot use the base device',
      'no-parent': 'No parent found',
    },
  },
}

export function NavMenuPanel({ doc, history, pageId, language }: Props) {
  const t = TEXT[language]
  const selectedIds = useSelection((s) => s.selectedIds)
  const activeDeviceId = useSelection((s) => s.activeDeviceId)
  const [devId, setDevId] = useState('')
  const page = findEditablePage(doc, pageId)
  const id = selectedIds.length === 1 ? selectedIds[0] : undefined
  const nav = page && id ? page.nodes[id] : undefined
  if (!page || !nav || nav.category !== 'nav') return null

  const others = doc.devices.slice(1)
  const target =
    others.find((d) => d.id === devId)?.id ??
    others.find((d) => d.kind === 'mobile')?.id ??
    others[0]?.id
  const why = target ? navMenuBlocker(doc, page.id, nav.id, target) : 'base-device'

  const make = () => {
    if (!target || why) return
    const ids = { buttonId: newId(), variableId: newId(), eventId: newId() }
    const ok = history.execute(
      createMobileMenuCommand({ pageId: page.id, navId: nav.id, mobileDeviceId: target, ids }),
    )
    const dev = activeDeviceId ?? doc.devices[0]?.id
    if (ok && dev) selectionStore.getState().pick(ids.buttonId, dev, false)
  }

  return (
    <section aria-label={t.title} style={{ textAlign: 'left', fontSize: 12, marginTop: 8 }}>
      <h3 style={{ margin: '4px 0' }}>{t.title}</h3>
      <label>
        {t.device}{' '}
        <select value={target ?? ''} onChange={(e) => setDevId(e.target.value)}>
          {others.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>{' '}
      <button type="button" disabled={why !== null} onClick={make}>
        {t.make}
      </button>
      <div>
        <small>
          {typeof nav.props.custom.mobileMenu === 'string'
            ? t.done(nav.props.custom.mobileMenu)
            : why
              ? t.blocked[why]
              : t.note}
        </small>
      </div>
    </section>
  )
}
