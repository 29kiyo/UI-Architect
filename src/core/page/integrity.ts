import { editablePages } from '../master'
import type { Command } from '../history'
import type { Id, Node, Page, UIDocument } from '../model'
import { getHomePage } from './ops'
import { parseLink } from './link'

export type IssueKind =
  | 'link-page-missing'
  | 'link-anchor-missing'
  | 'navigate-page-missing'
  | 'showhide-node-missing'
  | 'component-missing'
  | 'variant-missing'
  | 'component-other-page'

export type Issue = { kind: IssueKind; pageId: Id; nodeId: Id; detail: string }

function eachNode(doc: UIDocument): { owner: Page; node: Node }[] {
  const out: { owner: Page; node: Node }[] = []
  for (const owner of editablePages(doc)) {
    for (const node of Object.values(owner.nodes)) out.push({ owner, node })
  }
  return out
}

// リンク切れ・参照切れの検出
export function findIntegrityIssues(doc: UIDocument): Issue[] {
  const issues: Issue[] = []
  const pageIds = new Set(doc.pages.map((p) => p.id))
  for (const { owner, node } of eachNode(doc)) {
    const add = (kind: IssueKind, detail: string) =>
      issues.push({ kind, pageId: owner.id, nodeId: node.id, detail })
    const link = parseLink(node.props.content.href)
    if (link.kind === 'page' && !pageIds.has(link.pageId)) add('link-page-missing', link.pageId)
    if (link.kind === 'anchor' && !(link.nodeId in owner.nodes)) {
      add('link-anchor-missing', link.nodeId)
    }
    for (const e of node.events) {
      for (const a of e.actions) {
        if (a.type === 'navigate' && !pageIds.has(a.pageId)) add('navigate-page-missing', a.pageId)
        if (a.type === 'showHide' && !(a.nodeId in owner.nodes)) {
          add('showhide-node-missing', a.nodeId)
        }
      }
    }
    const ref = node.componentRef
    if (ref) {
      const def = doc.components.find((c) => c.id === ref.componentId)
      if (!def) add('component-missing', ref.componentId)
      else {
        if (ref.variantId && !def.variants.some((v) => v.id === ref.variantId)) {
          add('variant-missing', ref.variantId)
        }
        if (def.scope === 'page' && def.ownerId !== owner.id) {
          add('component-other-page', def.name)
        }
      }
    }
  }
  return issues
}

// 参照されているページ ID(リンク・navigate)
export function referencedPageIds(doc: UIDocument): Set<Id> {
  const out = new Set<Id>()
  for (const { node } of eachNode(doc)) {
    const link = parseLink(node.props.content.href)
    if (link.kind === 'page') out.add(link.pageId)
    for (const e of node.events) {
      for (const a of e.actions) if (a.type === 'navigate') out.add(a.pageId)
    }
  }
  return out
}

// ホーム以外で、どこからも参照されないページ
export function findOrphanPages(doc: UIDocument): Page[] {
  const ref = referencedPageIds(doc)
  const home = getHomePage(doc)?.id
  return doc.pages.filter((p) => p.id !== home && !ref.has(p.id))
}

// 削除するページを指している参照の件数(確認ダイアログ用)
export function countPageRefs(doc: UIDocument, pageId: Id): number {
  let n = 0
  for (const { owner, node } of eachNode(doc)) {
    if (owner.id === pageId) continue
    const link = parseLink(node.props.content.href)
    if (link.kind === 'page' && link.pageId === pageId) n++
    for (const e of node.events) {
      for (const a of e.actions) if (a.type === 'navigate' && a.pageId === pageId) n++
    }
  }
  return n
}

// ページ削除 + そのページへの参照の解除を 1 履歴で行う
export const createRemovePageCleanCommand = (pageId: Id, removeCommand: Command): Command => ({
  name: 'remove page',
  apply: (d) => {
    removeCommand.apply(d)
    for (const owner of editablePages(d)) {
      for (const node of Object.values(owner.nodes)) {
        const link = parseLink(node.props.content.href)
        if (link.kind === 'page' && link.pageId === pageId) node.props.content.href = ''
        for (const e of node.events) {
          e.actions = e.actions.filter((a) => !(a.type === 'navigate' && a.pageId === pageId))
        }
      }
    }
  },
})
