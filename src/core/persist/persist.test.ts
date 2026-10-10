import { describe, expect, it, vi } from 'vitest'
import { createLogger } from '@/shared'
import { VariableSchema, createEmptyDocument, createNode } from '../model'
import { createHistory, type Command } from '../history'
import { addNode, createDocumentStore } from '../store'
import {
  ProjectLoadError,
  createAutosave,
  createMemoryKv,
  createSnapshotStore,
  discardRecovery,
  findRecovery,
  hasFileSystemAccess,
  loadRecovery,
  parseProject,
  replaceDocument,
  serializeProject,
} from './index'

describe('project format', () => {
  it('保存 → 読込で等価(compact / pretty)', () => {
    const doc = createEmptyDocument('t')
    for (const pretty of [false, true]) {
      const back = parseProject(serializeProject(doc, { pretty }))
      expect(back.doc).toEqual(doc)
      expect(back.warnings).toEqual([])
    }
  })

  it('不正な入力は ProjectLoadError', () => {
    expect(() => parseProject('{')).toThrow(ProjectLoadError)
    expect(() => parseProject('{"format":"other"}')).toThrow(ProjectLoadError)
    const newer = JSON.stringify({ format: 'ui-architect', schemaVersion: 999, doc: {} })
    expect(() => parseProject(newer)).toThrow(/newer/)

    const env = JSON.parse(serializeProject(createEmptyDocument('t')))
    env.doc.pages[0].rootNodeId = 'nope'
    let err: unknown
    try {
      parseProject(JSON.stringify(env))
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ProjectLoadError)
    expect((err as ProjectLoadError).issues.length).toBeGreaterThan(0)
  })

  it('変数の整合性問題は warnings で返す', () => {
    const doc = {
      ...createEmptyDocument('t'),
      variables: [VariableSchema.parse({ id: '1', name: 'a', scope: 'page', ownerId: 'nope' })],
    }
    expect(parseProject(serializeProject(doc)).warnings).toHaveLength(1)
  })

  it('Node 環境ではファイルピッカーは使えない(フォールバック経路)', () => {
    expect(hasFileSystemAccess()).toBe(false)
  })
})

describe('snapshots', () => {
  function make(limit?: number) {
    const kv = createMemoryKv()
    let t = 0
    const snaps = createSnapshotStore(kv, { limit, now: () => ++t, logger: createLogger() })
    return { kv, snaps }
  }

  it('作成 → 一覧(新しい順)→ 復元 → 削除', async () => {
    const { snaps } = make()
    const doc = createEmptyDocument('t')
    const a = await snaps.create(doc, { kind: 'manual', label: 'first' })
    const b = await snaps.create(doc, { kind: 'auto', label: 'second' })
    expect((await snaps.list()).map((m) => m.id)).toEqual([b.id, a.id])
    expect((await snaps.load(a.id)).doc).toEqual(doc)
    await snaps.remove(a.id)
    expect((await snaps.list()).map((m) => m.id)).toEqual([b.id])
    await expect(snaps.load(a.id)).rejects.toThrow()
  })

  it('上限超過は古い自動分から削除し、自動が無ければ古い手動を削除する', async () => {
    const { snaps } = make(3)
    const doc = createEmptyDocument('t')
    const m1 = await snaps.create(doc, { kind: 'manual', label: 'm1' })
    const a1 = await snaps.create(doc, { kind: 'auto', label: 'a1' })
    const a2 = await snaps.create(doc, { kind: 'auto', label: 'a2' })
    const a3 = await snaps.create(doc, { kind: 'auto', label: 'a3' })
    expect((await snaps.list()).map((m) => m.id).sort()).toEqual([m1.id, a2.id, a3.id].sort())
    expect((await snaps.list()).some((m) => m.id === a1.id)).toBe(false)

    const { snaps: s2 } = make(2)
    const x1 = await s2.create(doc, { kind: 'manual', label: 'x1' })
    const x2 = await s2.create(doc, { kind: 'manual', label: 'x2' })
    const x3 = await s2.create(doc, { kind: 'manual', label: 'x3' })
    expect((await s2.list()).map((m) => m.id)).toEqual([x3.id, x2.id])
    expect((await s2.list()).some((m) => m.id === x1.id)).toBe(false)
  })

  it('今作った自動スナップショットは、他に自動が無くても直ちに消えない', async () => {
    const { snaps } = make(2)
    const doc = createEmptyDocument('t')
    await snaps.create(doc, { kind: 'manual', label: 'm1' })
    await snaps.create(doc, { kind: 'manual', label: 'm2' })
    const a = await snaps.create(doc, { kind: 'auto', label: 'a' })
    const list = await snaps.list()
    expect(list).toHaveLength(2)
    expect(list.some((m) => m.id === a.id)).toBe(true)
  })
})

describe('autosave / recovery', () => {
  function setup(opts: { delayMs?: number; snapshotIntervalMs?: number } = {}) {
    const doc = createEmptyDocument('t')
    const store = createDocumentStore(doc)
    const logger = createLogger()
    const history = createHistory(store, { logger })
    const kv = createMemoryKv()
    const clock = { t: 0 }
    const now = () => clock.t
    const snapshots = createSnapshotStore(kv, { now, logger })
    const autosave = createAutosave({ store, history, kv, snapshots, now, logger, ...opts })
    const add = (name: string): Command => ({
      name: 'add',
      apply: (d) =>
        addNode(d.pages[0], createNode({ type: 'element', name }), d.pages[0].rootNodeId),
    })
    return { doc, store, history, kv, clock, snapshots, autosave, add, logger }
  }

  it('flush で dirty な自動保存が書かれ、復旧候補として読める', async () => {
    const s = setup()
    s.history.execute(s.add('a'))
    await s.autosave.flush()
    const info = await findRecovery(s.kv)
    expect(info).toBeDefined()
    expect((await loadRecovery(info!, s.logger)).doc).toEqual(s.store.getState().doc)
  })

  it('markClean 後は復旧候補にならず、discardRecovery で消える', async () => {
    const s = setup()
    s.history.execute(s.add('a'))
    await s.autosave.flush()
    await s.autosave.markClean()
    expect(await findRecovery(s.kv)).toBeUndefined()
    s.history.execute(s.add('b'))
    await s.autosave.flush()
    expect(await findRecovery(s.kv)).toBeDefined()
    await discardRecovery(s.kv)
    expect(await s.kv.get('autosave')).toBeUndefined()
  })

  it('壊れた自動保存は復旧候補にしない', async () => {
    const kv = createMemoryKv()
    await kv.set('autosave', '{bad')
    expect(await findRecovery(kv)).toBeUndefined()
  })

  it('変更後 delayMs でまとめて 1 回書かれる(デバウンス)', async () => {
    vi.useFakeTimers()
    try {
      const s = setup({ delayMs: 500 })
      s.history.execute(s.add('a'))
      await vi.advanceTimersByTimeAsync(300)
      s.history.execute(s.add('b'))
      await vi.advanceTimersByTimeAsync(499)
      expect(await s.kv.get('autosave')).toBeUndefined()
      await vi.advanceTimersByTimeAsync(1)
      await s.autosave.idle()
      const info = await findRecovery(s.kv)
      expect(info).toBeDefined()
      expect(Object.keys(parseProject(info!.text).doc.pages[0].nodes)).toHaveLength(3) // root + a + b
      s.autosave.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('dispose 後は書かれない', async () => {
    vi.useFakeTimers()
    try {
      const s = setup({ delayMs: 100 })
      s.autosave.dispose()
      s.history.execute(s.add('a'))
      await vi.advanceTimersByTimeAsync(1000)
      expect(await s.kv.get('autosave')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('自動スナップショットは最小間隔ごとにだけ作られる', async () => {
    const s = setup({ snapshotIntervalMs: 1000 })
    s.history.execute(s.add('a'))
    s.clock.t = 500
    await s.autosave.flush()
    expect(await s.snapshots.list()).toHaveLength(0)
    s.clock.t = 1500
    await s.autosave.flush()
    expect(await s.snapshots.list()).toHaveLength(1)
    s.clock.t = 1600
    await s.autosave.flush()
    expect(await s.snapshots.list()).toHaveLength(1)
    expect((await s.snapshots.list())[0].kind).toBe('auto')
  })

  it('実行ログに autosave が出る', async () => {
    const s = setup()
    await s.autosave.flush()
    expect(
      s.logger.getEntries().some((e) => e.taskName === 'autosave' && e.status === 'done'),
    ).toBe(true)
  })
})

describe('replaceDocument', () => {
  it('ドキュメントを差し替え、履歴を破棄する。トランザクション中は拒否', () => {
    const store = createDocumentStore(createEmptyDocument('a'))
    const history = createHistory(store, { logger: createLogger() })
    history.execute({ name: 'x', apply: (d) => void (d.project.name = 'changed') })
    expect(history.getState().canUndo).toBe(true)
    const next = createEmptyDocument('loaded')
    replaceDocument(store, history, next)
    expect(store.getState().doc).toBe(next)
    expect(history.getState().canUndo).toBe(false)

    history.begin('tx')
    expect(() => replaceDocument(store, history, createEmptyDocument('z'))).toThrow()
    expect(store.getState().doc).toBe(next)
    history.rollback()
  })
})
