import { describe, expect, it } from 'vitest'
import { createLogger } from '@/shared'
import { createEmptyDocument, createNode } from '../model'
import { addNode, createDocumentStore } from '../store'
import { createHistory, type Command } from './index'

function setup(limit?: number) {
  const doc = createEmptyDocument('t')
  const store = createDocumentStore(doc)
  const logger = createLogger()
  const history = createHistory(store, { logger, limit })
  const node = createNode({ type: 'element', name: 'n0' })
  const rootId = doc.pages[0].rootNodeId
  const add: Command = { name: 'add', apply: (d) => addNode(d.pages[0], node, rootId) }
  const rename = (name: string, coalesceKey?: string): Command => ({
    name: 'rename',
    coalesceKey,
    apply: (d) => {
      d.pages[0].nodes[node.id].name = name
    },
  })
  const nameOf = () => store.getState().doc.pages[0].nodes[node.id]?.name
  const tasks = () => logger.getEntries().filter((e) => e.taskName)
  return { doc, store, logger, history, add, rename, nameOf, tasks }
}

describe('history: execute / undo / redo', () => {
  it('Undo / Redo でドキュメントが復元される', () => {
    const s = setup()
    expect(s.history.execute(s.add)).toBe(true)
    const afterAdd = s.store.getState().doc
    expect(s.history.undo()).toBe(true)
    expect(s.store.getState().doc).toEqual(s.doc)
    expect(s.history.redo()).toBe(true)
    expect(s.store.getState().doc).toEqual(afterAdd)
    expect(s.history.undo() && s.history.undo()).toBe(false) // 2 回目は履歴なし
  })

  it('変更なしの Command は履歴に積まれない', () => {
    const s = setup()
    expect(s.history.execute({ name: 'noop', apply: () => {} })).toBe(false)
    expect(s.history.getState().canUndo).toBe(false)
  })

  it('新しい Command で redo 履歴が消える', () => {
    const s = setup()
    s.history.execute(s.add)
    s.history.execute(s.rename('a'))
    s.history.undo()
    expect(s.history.getState().canRedo).toBe(true)
    s.history.execute(s.rename('b'))
    expect(s.history.getState().canRedo).toBe(false)
  })

  it('履歴上限を超えた古い履歴は捨てられる', () => {
    const s = setup(3)
    s.history.execute(s.add)
    for (let i = 0; i < 5; i++) s.history.execute(s.rename(`v${i}`))
    let n = 0
    while (s.history.undo()) n++
    expect(n).toBe(3)
  })

  it('失敗した Command はドキュメントを変えず、履歴にも積まれない', () => {
    const s = setup()
    const bad: Command = {
      name: 'bad',
      apply: () => {
        throw new Error('x')
      },
    }
    expect(() => s.history.execute(bad)).toThrow('x')
    expect(s.store.getState().doc).toBe(s.doc)
    expect(s.history.getState().canUndo).toBe(false)
    expect(s.tasks()[0]).toMatchObject({ taskName: 'command: bad', status: 'error' })
  })
})

describe('history: transaction', () => {
  it('複数操作が 1 履歴になる', () => {
    const s = setup()
    s.history.transaction('multi', () => {
      s.history.execute(s.add)
      s.history.execute(s.rename('x'))
    })
    expect(s.nameOf()).toBe('x')
    expect(s.history.getState()).toMatchObject({ undoCount: 1, undoName: 'multi' })
    s.history.undo()
    expect(s.store.getState().doc).toEqual(s.doc)
    s.history.redo()
    expect(s.nameOf()).toBe('x')
  })

  it('throw すると全て巻き戻され、履歴は増えない', () => {
    const s = setup()
    expect(() =>
      s.history.transaction('tx', () => {
        s.history.execute(s.add)
        s.history.execute(s.rename('x'))
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(s.store.getState().doc).toEqual(s.doc)
    expect(s.history.getState()).toMatchObject({ canUndo: false, inTransaction: false })
  })

  it('トランザクション中の undo とネストは拒否される', () => {
    const s = setup()
    s.history.begin('a')
    expect(() => s.history.undo()).toThrow()
    expect(() => s.history.begin('b')).toThrow()
    s.history.rollback()
  })
})

describe('history: coalescing', () => {
  it('同じキーの連続変更は 1 履歴になる', () => {
    const s = setup()
    s.history.execute(s.add)
    for (const v of ['a', 'b', 'c']) s.history.execute(s.rename(v, 'drag'))
    expect(s.history.getState().undoCount).toBe(2)
    s.history.undo()
    expect(s.nameOf()).toBe('n0')
    s.history.redo()
    expect(s.nameOf()).toBe('c')
  })

  it('キーが違う / breakCoalescing 後 / undo-redo 後はまとめない', () => {
    const s = setup()
    s.history.execute(s.add)
    s.history.execute(s.rename('a', 'k1'))
    s.history.execute(s.rename('b', 'k2'))
    s.history.undo()
    expect(s.nameOf()).toBe('a')

    const t = setup()
    t.history.execute(t.add)
    t.history.execute(t.rename('a', 'k'))
    t.history.breakCoalescing()
    t.history.execute(t.rename('b', 'k'))
    t.history.undo()
    expect(t.nameOf()).toBe('a')

    const u = setup()
    u.history.execute(u.add)
    u.history.execute(u.rename('a', 'k'))
    u.history.undo()
    u.history.redo()
    u.history.execute(u.rename('b', 'k'))
    u.history.undo()
    expect(u.nameOf()).toBe('a')
    u.history.undo()
    expect(u.nameOf()).toBe('n0')
  })
})

describe('history: subscribe / logger', () => {
  it('変更時だけ通知され、state は変更がなければ同一参照', () => {
    const s = setup()
    let calls = 0
    const off = s.history.subscribe(() => calls++)
    const a = s.history.getState()
    expect(s.history.getState()).toBe(a)
    s.history.execute(s.add)
    expect(calls).toBe(1)
    expect(s.history.getState()).not.toBe(a)
    expect(s.history.getState()).toMatchObject({ canUndo: true, canRedo: false, undoName: 'add' })
    off()
    s.history.undo()
    expect(calls).toBe(1)
  })

  it('実行ログ: 通常 Command / undo / transaction は出て、coalesce 対象は出ない', () => {
    const s = setup()
    s.history.execute(s.add)
    for (const v of ['a', 'b', 'c']) s.history.execute(s.rename(v, 'drag'))
    expect(s.tasks().map((e) => e.taskName)).toEqual(['command: add'])
    s.history.undo()
    s.history.transaction('tx', () => s.history.execute(s.rename('z')))
    expect(s.tasks().map((e) => [e.taskName, e.status])).toEqual([
      ['command: add', 'done'],
      ['undo: rename', 'done'],
      ['transaction: tx', 'done'],
    ])
  })
})
