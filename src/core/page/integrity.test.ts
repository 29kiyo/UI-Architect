import { describe, expect, it } from 'vitest'
import { createHistory } from '../history'
import { createEmptyDocument, createNode, createPage, newId } from '../model'
import { createDocumentStore } from '../store'
import { createRemovePageCommand } from './ops'
import {
  countPageRefs,
  createRemovePageCleanCommand,
  findIntegrityIssues,
  findOrphanPages,
} from './integrity'

function setup() {
  const store = createDocumentStore(createEmptyDocument('t'))
  const history = createHistory(store)
  const doc = () => store.getState().doc
  const p2 = createPage('P2', '/p2')
  const btn = createNode({ type: 'element', category: 'button', name: 'b' })
  store.getState().update((d) => {
    d.pages.push(p2)
    const p = d.pages[0]!
    p.nodes[btn.id] = btn
    p.nodes[p.rootNodeId]!.children.push(btn.id)
  })
  const set = (href: string) =>
    store.getState().update((d) => {
      d.pages[0]!.nodes[btn.id]!.props.content.href = href
    })
  return { history, doc, p2, btn, set, store }
}

describe('整合性', () => {
  it('孤立ページ: リンクされるまで孤立、ホームは除く', () => {
    const s = setup()
    expect(findOrphanPages(s.doc()).map((p) => p.id)).toEqual([s.p2.id])
    s.set(`page:${s.p2.id}`)
    expect(findOrphanPages(s.doc())).toEqual([])
  })

  it('リンク切れを検出する', () => {
    const s = setup()
    expect(findIntegrityIssues(s.doc())).toEqual([])
    s.set('page:nope')
    expect(findIntegrityIssues(s.doc())[0]).toMatchObject({
      kind: 'link-page-missing',
      nodeId: s.btn.id,
    })
    s.set('#node:nope')
    expect(findIntegrityIssues(s.doc())[0]!.kind).toBe('link-anchor-missing')
    s.store.getState().update((d) => {
      d.pages[0]!.nodes[s.btn.id]!.props.content.href = ''
      d.pages[0]!.nodes[s.btn.id]!.componentRef = {
        componentId: newId(),
        overrides: {},
        slotContent: {},
      }
    })
    expect(findIntegrityIssues(s.doc())[0]!.kind).toBe('component-missing')
  })

  it('ページ削除で参照が解除され、Undo で戻る', () => {
    const s = setup()
    s.set(`page:${s.p2.id}`)
    expect(countPageRefs(s.doc(), s.p2.id)).toBe(1)
    s.history.execute(createRemovePageCleanCommand(s.p2.id, createRemovePageCommand(s.p2.id)))
    expect(s.doc().pages).toHaveLength(1)
    expect(s.doc().pages[0]!.nodes[s.btn.id]!.props.content.href).toBe('')
    expect(findIntegrityIssues(s.doc())).toEqual([])
    s.history.undo()
    expect(s.doc().pages[0]!.nodes[s.btn.id]!.props.content.href).toBe(`page:${s.p2.id}`)
  })
})
