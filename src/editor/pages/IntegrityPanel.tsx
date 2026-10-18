import { useMemo } from 'react'
import {
  findIntegrityIssues,
  findOrphanPages,
  type Issue,
  type IssueKind,
  type UIDocument,
} from '@/core'
import { selectionStore } from '../canvas/selection'

type Props = {
  doc: UIDocument
  language: 'ja' | 'en'
  onSelectPage: (id: string) => void
}

const TEXT = {
  ja: {
    title: '整合性',
    ok: '問題はありません',
    orphan: '孤立ページ(どこからもリンクされていません)',
    kinds: {
      'link-page-missing': 'リンク先のページがありません',
      'link-anchor-missing': 'リンク先の要素がありません',
      'navigate-page-missing': '遷移先のページがありません',
      'showhide-node-missing': '表示切替の対象がありません',
      'component-missing': 'コンポーネントの定義がありません',
      'variant-missing': 'バリアントがありません',
      'component-other-page': '他ページ専用のコンポーネントです',
    } satisfies Record<IssueKind, string>,
  },
  en: {
    title: 'Integrity',
    ok: 'No problems',
    orphan: 'Orphan pages (not linked from anywhere)',
    kinds: {
      'link-page-missing': 'Link target page is missing',
      'link-anchor-missing': 'Link target node is missing',
      'navigate-page-missing': 'Navigate target page is missing',
      'showhide-node-missing': 'Show/hide target is missing',
      'component-missing': 'Component definition is missing',
      'variant-missing': 'Variant is missing',
      'component-other-page': 'Component is private to another page',
    } satisfies Record<IssueKind, string>,
  },
}

export function IntegrityPanel({ doc, language, onSelectPage }: Props) {
  const t = TEXT[language]
  const issues = useMemo(() => findIntegrityIssues(doc), [doc])
  const orphans = useMemo(() => findOrphanPages(doc), [doc])
  const total = issues.length + orphans.length

  const jump = (i: Issue) => {
    onSelectPage(i.pageId)
    const dev = selectionStore.getState().activeDeviceId ?? doc.devices[0]?.id
    // ページ切替で選択が消えるため、切替の後に選ぶ
    if (dev) setTimeout(() => selectionStore.getState().pick(i.nodeId, dev, false), 0)
  }

  return (
    <section aria-label={t.title} style={{ textAlign: 'left', marginBottom: 8, fontSize: 13 }}>
      <h3 style={{ margin: '4px 0' }}>
        {t.title} {total > 0 && <small>({total})</small>}
      </h3>
      {total === 0 && <small>{t.ok}</small>}
      {issues.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {issues.map((i, k) => (
            <li key={`${i.pageId}:${i.nodeId}:${i.kind}:${k}`}>
              <button type="button" onClick={() => jump(i)} style={{ textAlign: 'left' }}>
                {t.kinds[i.kind]}
              </button>
            </li>
          ))}
        </ul>
      )}
      {orphans.length > 0 && (
        <>
          <div>
            <strong>{t.orphan}</strong>
          </div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {orphans.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onSelectPage(p.id)}>
                  {p.name} <small>{p.route}</small>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
