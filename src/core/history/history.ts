import type { Draft, Patch } from 'immer'
import { logger as defaultLogger, type Logger } from '@/shared'
import type { UIDocument } from '../model'
import type { DocumentStore, UpdateResult } from '../store'

// 全変更はこの Command 経由で行う
export type Command = {
  name: string
  apply: (draft: Draft<UIDocument>) => void
  // 同じキーが連続した場合、履歴 1 件にまとめる(ドラッグ中の連続変更など)
  coalesceKey?: string
}

type Entry = {
  name: string
  patches: Patch[]
  inversePatches: Patch[]
  coalesceKey?: string
}

export type HistoryState = {
  canUndo: boolean
  canRedo: boolean
  undoName: string | undefined
  redoName: string | undefined
  undoCount: number
  redoCount: number
  inTransaction: boolean
}

export type HistoryOptions = { limit?: number; logger?: Logger }

export function createHistory(store: DocumentStore, options: HistoryOptions = {}) {
  const limit = options.limit ?? 100
  const log = options.logger ?? defaultLogger

  let undoStack: Entry[] = []
  let redoStack: Entry[] = []
  // true の間は、直近の履歴へ coalesce しない(undo/redo 後・breakCoalescing 後)
  let sealed = true
  let tx: {
    name: string
    results: UpdateResult[]
    task: ReturnType<Logger['startTask']>
  } | null = null
  const listeners = new Set<() => void>()

  function computeState(): HistoryState {
    return {
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      undoName: undoStack[undoStack.length - 1]?.name,
      redoName: redoStack[redoStack.length - 1]?.name,
      undoCount: undoStack.length,
      redoCount: redoStack.length,
      inTransaction: tx !== null,
    }
  }

  // useSyncExternalStore 向けに、変更があるまで同一参照を返す
  let snapshot = computeState()
  function notify() {
    snapshot = computeState()
    listeners.forEach((l) => l())
  }

  function push(entry: Entry) {
    const top = undoStack[undoStack.length - 1]
    if (entry.coalesceKey && top && !sealed && top.coalesceKey === entry.coalesceKey) {
      undoStack[undoStack.length - 1] = {
        ...top,
        patches: [...top.patches, ...entry.patches],
        // 後の変更の inverse を先に適用する
        inversePatches: [...entry.inversePatches, ...top.inversePatches],
      }
    } else {
      undoStack.push(entry)
      if (undoStack.length > limit) undoStack.shift()
    }
    redoStack = []
    sealed = !entry.coalesceKey
  }

  // 変更があれば true
  function execute(command: Command): boolean {
    // coalesce 対象とトランザクション内は個別に実行ログへ出さない
    const task = !tx && !command.coalesceKey ? log.startTask(`command: ${command.name}`) : null
    try {
      const result = store.getState().update(command.apply)
      if (result.patches.length === 0) {
        task?.done()
        return false
      }
      if (tx) {
        tx.results.push(result)
      } else {
        push({ name: command.name, coalesceKey: command.coalesceKey, ...result })
        notify()
      }
      task?.done()
      return true
    } catch (err) {
      task?.fail(err)
      throw err
    }
  }

  function undo(): boolean {
    if (tx) throw new Error('cannot undo during transaction')
    const entry = undoStack.pop()
    if (!entry) return false
    const task = log.startTask(`undo: ${entry.name}`)
    try {
      store.getState().applyPatches(entry.inversePatches)
    } catch (err) {
      undoStack.push(entry)
      task.fail(err)
      throw err
    }
    redoStack.push(entry)
    sealed = true
    task.done()
    notify()
    return true
  }

  function redo(): boolean {
    if (tx) throw new Error('cannot redo during transaction')
    const entry = redoStack.pop()
    if (!entry) return false
    const task = log.startTask(`redo: ${entry.name}`)
    try {
      store.getState().applyPatches(entry.patches)
    } catch (err) {
      redoStack.push(entry)
      task.fail(err)
      throw err
    }
    undoStack.push(entry)
    sealed = true
    task.done()
    notify()
    return true
  }

  function begin(name: string) {
    if (tx) throw new Error('transaction already active')
    tx = { name, results: [], task: log.startTask(`transaction: ${name}`) }
    notify()
  }

  function commit() {
    if (!tx) throw new Error('no active transaction')
    const t = tx
    tx = null
    if (t.results.length > 0) {
      push({
        name: t.name,
        patches: t.results.flatMap((r) => r.patches),
        inversePatches: [...t.results].reverse().flatMap((r) => r.inversePatches),
      })
    }
    t.task.done()
    notify()
  }

  function rollback() {
    if (!tx) throw new Error('no active transaction')
    const t = tx
    tx = null
    try {
      const inverse = [...t.results].reverse().flatMap((r) => r.inversePatches)
      store.getState().applyPatches(inverse)
      t.task.fail('rolled back')
    } catch (err) {
      t.task.fail(err)
      throw err
    } finally {
      notify()
    }
  }

  // fn 内の execute を 1 履歴にまとめる。throw したら全て巻き戻す(同期 fn のみ)
  function transaction<T>(name: string, fn: () => T): T {
    begin(name)
    let result: T
    try {
      result = fn()
    } catch (err) {
      rollback()
      throw err
    }
    commit()
    return result
  }

  // 次の同キー Command を新しい履歴にする(ポインタを離した時など)
  function breakCoalescing() {
    sealed = true
  }

  function clear() {
    if (tx) throw new Error('cannot clear during transaction')
    undoStack = []
    redoStack = []
    sealed = true
    notify()
  }

  return {
    execute,
    undo,
    redo,
    begin,
    commit,
    rollback,
    transaction,
    breakCoalescing,
    clear,
    getState: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type History = ReturnType<typeof createHistory>
