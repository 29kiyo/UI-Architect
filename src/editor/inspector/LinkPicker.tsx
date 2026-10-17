import { useState } from 'react'
import {
  NAV_MODES,
  NAV_TRANSITIONS,
  asNavMode,
  asNavTransition,
  formatLink,
  isValidExternalUrl,
  parseLink,
  type Id,
  type Link,
  type NavMode,
  type NavTransition,
  type Page,
  type UIDocument,
} from '@/core'

type Props = {
  doc: UIDocument
  page: Page // 編集中のページ(アンカー候補)
  href: unknown
  navMode: unknown
  navTransition: unknown
  language: 'ja' | 'en'
  onHref: (value: string) => void
  onMeta: (key: 'navMode' | 'navTransition', value: string) => void
}

const TEXT = {
  ja: {
    kind: 'リンク先の種類',
    none: 'なし',
    page: 'ページ',
    anchor: 'このページ内の要素',
    external: '外部 URL',
    raw: '取り込み値(そのまま)',
    pick: '選択…',
    mode: '遷移',
    modes: { push: '進む(push)', replace: '置き換え(replace)', back: '戻る' },
    transition: 'アニメーション',
    transitions: { none: 'なし', fade: 'フェード', slide: 'スライド' },
    invalid: 'http:// か https:// で始まる URL を入力してください',
    missing: '(存在しません)',
  },
  en: {
    kind: 'Link type',
    none: 'None',
    page: 'Page',
    anchor: 'Element on this page',
    external: 'External URL',
    raw: 'Imported value (as is)',
    pick: 'Select…',
    mode: 'Navigation',
    modes: { push: 'Push', replace: 'Replace', back: 'Back' },
    transition: 'Transition',
    transitions: { none: 'None', fade: 'Fade', slide: 'Slide' },
    invalid: 'Enter a URL starting with http:// or https://',
    missing: '(missing)',
  },
}

type Kind = Link['kind']

export function LinkPicker({
  doc,
  page,
  href,
  navMode,
  navTransition,
  language,
  onHref,
  onMeta,
}: Props) {
  const t = TEXT[language]
  const link = parseLink(href)
  const [err, setErr] = useState('')
  const kinds: Kind[] =
    link.kind === 'raw'
      ? ['none', 'page', 'anchor', 'external', 'raw']
      : ['none', 'page', 'anchor', 'external']

  const change = (k: Kind) => {
    setErr('')
    if (k === 'raw') return
    onHref(
      k === 'none'
        ? ''
        : formatLink(
            k === 'external'
              ? { kind: 'external', url: 'https://' }
              : k === 'page'
                ? { kind: 'page', pageId: doc.pages[0]?.id ?? '' }
                : { kind: 'anchor', nodeId: page.rootNodeId },
          ),
    )
  }
  const nodeIds: Id[] = Object.keys(page.nodes)

  return (
    <div style={{ gridColumn: '1 / -1', margin: '2px 0' }}>
      <div>
        <label>
          {t.kind}{' '}
          <select value={link.kind} onChange={(e) => change(e.target.value as Kind)}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {t[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {link.kind === 'page' && (
        <select
          value={link.pageId}
          onChange={(e) => onHref(formatLink({ kind: 'page', pageId: e.target.value }))}
        >
          {!doc.pages.some((p) => p.id === link.pageId) && (
            <option value={link.pageId}>{t.missing}</option>
          )}
          {doc.pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.route})
            </option>
          ))}
        </select>
      )}
      {link.kind === 'anchor' && (
        <select
          value={link.nodeId}
          onChange={(e) => onHref(formatLink({ kind: 'anchor', nodeId: e.target.value }))}
        >
          {!(link.nodeId in page.nodes) && <option value={link.nodeId}>{t.missing}</option>}
          {nodeIds.map((id) => (
            <option key={id} value={id}>
              {page.nodes[id]?.name ?? id}
            </option>
          ))}
        </select>
      )}
      {link.kind === 'external' && (
        <input
          key={link.url}
          defaultValue={link.url}
          style={{ width: '100%', boxSizing: 'border-box' }}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim()
            if (!isValidExternalUrl(v)) {
              setErr(t.invalid)
              e.currentTarget.value = link.url
              return
            }
            setErr('')
            if (v !== link.url) onHref(v)
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      )}
      {link.kind === 'raw' && <small>{link.value}</small>}
      {err && <div role="alert">{err}</div>}
      {link.kind !== 'none' && link.kind !== 'raw' && (
        <div>
          <label>
            {t.mode}{' '}
            <select value={asNavMode(navMode)} onChange={(e) => onMeta('navMode', e.target.value)}>
              {NAV_MODES.map((m: NavMode) => (
                <option key={m} value={m}>
                  {t.modes[m]}
                </option>
              ))}
            </select>
          </label>{' '}
          <label>
            {t.transition}{' '}
            <select
              value={asNavTransition(navTransition)}
              onChange={(e) => onMeta('navTransition', e.target.value)}
            >
              {NAV_TRANSITIONS.map((m: NavTransition) => (
                <option key={m} value={m}>
                  {t.transitions[m]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  )
}
