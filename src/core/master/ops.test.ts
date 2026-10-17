import { describe, expect, it } from 'vitest'
import { createHistory } from '../history'
import { createEmptyDocument, UIDocumentSchema } from '../model'
import { createDocumentStore } from '../store'
import {
  createAddMasterCommand,
  createMasterFor,
  createMoveMasterCommand,
  createRemoveMasterCommand,
  createRenameMasterCommand,
  createSetMasterHiddenCommand,
  createSetMasterPositionCommand,
  findEditablePage,
  visibleMasters,
} from './ops'

function setup() {
  const store = createDocumentStore(createEmptyDocument('t'))
  const history = createHistory(store)
  return { history, doc: () => store.getState().doc }
}

describe('master ops', () => {
  it('追加 → Undo/Redo、ページ/マスターを ID で探せる', () => {
    const { history, doc } = setup()
    const m = createMasterFor(doc())
    expect(m.name).toBe('Master 1')
    history.execute(createAddMasterCommand(m))
    expect(findEditablePage(doc(), m.id)?.rootNodeId).toBe(m.rootNodeId)
    expect(findEditablePage(doc(), doc().pages[0]!.id)).toBeDefined()
    history.undo()
    expect(doc().masters).toHaveLength(0)
    history.redo()
    expect(doc().masters).toHaveLength(1)
  })

  it('ページ別に隠す / 戻す、全ページに既定で表示', () => {
    const { history, doc } = setup()
    const m = createMasterFor(doc())
    history.execute(createAddMasterCommand(m))
    const page = doc().pages[0]!
    expect(visibleMasters(doc(), page)).toHaveLength(1)
    history.execute(createSetMasterHiddenCommand(page.id, m.id, true))
    expect(visibleMasters(doc(), doc().pages[0]!)).toHaveLength(0)
    history.execute(createSetMasterHiddenCommand(page.id, m.id, false))
    expect(doc().pages[0]!.hiddenMasterIds).toBeUndefined()
    history.undo()
    expect(visibleMasters(doc(), doc().pages[0]!)).toHaveLength(0)
  })

  it('削除すると各ページの隠す指定も消える。Undo で両方戻る', () => {
    const { history, doc } = setup()
    const m = createMasterFor(doc())
    history.execute(createAddMasterCommand(m))
    history.execute(createSetMasterHiddenCommand(doc().pages[0]!.id, m.id, true))
    history.execute(createRemoveMasterCommand(m.id))
    expect(doc().masters).toHaveLength(0)
    expect(doc().pages[0]!.hiddenMasterIds).toBeUndefined()
    history.undo()
    expect(doc().pages[0]!.hiddenMasterIds).toEqual([m.id])
  })

  it('名前・位置・並び替え', () => {
    const { history, doc } = setup()
    const a = createMasterFor(doc(), 'top')
    history.execute(createAddMasterCommand(a))
    const b = createMasterFor(doc(), 'bottom')
    history.execute(createAddMasterCommand(b))
    expect(b.name).toBe('Master 2')
    history.execute(createRenameMasterCommand(a.id, '  Header  '))
    history.execute(createSetMasterPositionCommand(a.id, 'overlay'))
    history.execute(createMoveMasterCommand(b.id, 0))
    expect(doc().masters.map((m) => m.id)).toEqual([b.id, a.id])
    expect(doc().masters[1]).toMatchObject({ name: 'Header', position: 'overlay' })
  })

  it('スキーマ: masters 無しの旧データも読め、往復で保持される', () => {
    const { history, doc } = setup()
    const old: Record<string, unknown> = { ...doc() }
    delete old.masters
    expect(UIDocumentSchema.parse(old).masters).toEqual([])
    const m = createMasterFor(doc())
    history.execute(createAddMasterCommand(m))
    history.execute(createSetMasterHiddenCommand(doc().pages[0]!.id, m.id, true))
    const back = UIDocumentSchema.parse(structuredClone(doc()))
    expect(back.masters[0]).toMatchObject({ id: m.id, position: 'top' })
    expect(back.pages[0]!.hiddenMasterIds).toEqual([m.id])
  })
})
