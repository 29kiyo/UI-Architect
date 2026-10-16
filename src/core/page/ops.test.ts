import { describe, expect, it } from 'vitest'
import { createHistory } from '../history'
import { createEmptyDocument, UIDocumentSchema } from '../model'
import { createDocumentStore } from '../store'
import {
  canRemovePage,
  createAddPageCommand,
  createMovePageCommand,
  createRemovePageCommand,
  createRenamePageCommand,
  createSetHomePageCommand,
  createSetRouteCommand,
  createPageFor,
  duplicatePage,
  getHomePage,
  normalizeRoute,
  validateRoute,
} from './ops'

function setup() {
  const store = createDocumentStore(createEmptyDocument('t'))
  const history = createHistory(store)
  return { history, doc: () => store.getState().doc }
}

describe('page ops', () => {
  it('追加 → Undo/Redo', () => {
    const { history, doc } = setup()
    const p = createPageFor(doc())
    expect(p.name).toBe('Page 2')
    expect(p.route).toBe('/page-2')
    history.execute(createAddPageCommand(p))
    expect(doc().pages.map((x) => x.id)).toContain(p.id)
    history.undo()
    expect(doc().pages).toHaveLength(1)
    history.redo()
    expect(doc().pages).toHaveLength(2)
  })

  it('複製: 別 ID・同じノード構成・ルート重複なし', () => {
    const { doc } = setup()
    const src = doc().pages[0]!
    const p = duplicatePage(doc(), src.id)
    expect(p.id).not.toBe(src.id)
    expect(Object.keys(p.nodes)).toEqual(Object.keys(src.nodes))
    expect(p.name).toBe('Page 1 copy')
    expect(p.route).toBe('/copy')
  })

  it('削除: 最後の 1 ページは不可、ホームなら解除', () => {
    const { history, doc } = setup()
    const first = doc().pages[0]!
    expect(canRemovePage(doc())).toBe(false)
    expect(() => createRemovePageCommand(first.id).apply(structuredClone(doc()))).toThrow()
    const p = createPageFor(doc())
    history.execute(createAddPageCommand(p))
    history.execute(createSetHomePageCommand(p.id))
    expect(getHomePage(doc())?.id).toBe(p.id)
    history.execute(createRemovePageCommand(p.id))
    expect(doc().project.homePageId).toBeUndefined()
    expect(getHomePage(doc())?.id).toBe(first.id)
    history.undo()
    expect(getHomePage(doc())?.id).toBe(p.id)
  })

  it('並び替え', () => {
    const { history, doc } = setup()
    const a = doc().pages[0]!
    const b = createPageFor(doc())
    history.execute(createAddPageCommand(b))
    const c = createPageFor(doc())
    history.execute(createAddPageCommand(c))
    history.execute(createMovePageCommand(c.id, 0))
    expect(doc().pages.map((x) => x.id)).toEqual([c.id, a.id, b.id])
  })

  it('名前・ルート', () => {
    const { history, doc } = setup()
    const p = createPageFor(doc())
    history.execute(createAddPageCommand(p))
    history.execute(createRenamePageCommand(p.id, '  About  '))
    history.execute(createSetRouteCommand(p.id, 'about us'))
    expect(doc().pages[1]).toMatchObject({ name: 'About', route: '/about-us' })
    expect(() => createSetRouteCommand(p.id, '/').apply(structuredClone(doc()))).toThrow()
  })

  it('ルート正規化と検証', () => {
    const { doc } = setup()
    expect(normalizeRoute('')).toBe('/')
    expect(normalizeRoute('//a//b/')).toBe('/a/b')
    expect(validateRoute(doc(), undefined, '/')).toBe('duplicate')
    expect(validateRoute(doc(), doc().pages[0]!.id, '/')).toBeNull()
    expect(validateRoute(doc(), undefined, '/a?x')).toBe('invalid')
  })

  it('homePageId はスキーマ往復で保持される', () => {
    const { history, doc } = setup()
    const p = createPageFor(doc())
    history.execute(createAddPageCommand(p))
    history.execute(createSetHomePageCommand(p.id))
    expect(UIDocumentSchema.parse(doc()).project.homePageId).toBe(p.id)
  })
})
