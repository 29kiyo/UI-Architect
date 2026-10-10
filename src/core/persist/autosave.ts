import { logger as defaultLogger, type Logger } from '@/shared'
import type { History } from '../history'
import type { DocumentStore } from '../store'
import { parseProject, serializeProject, type ParsedProject } from './format'
import type { KeyValueStore } from './kv'
import type { SnapshotStore } from './snapshots'

const AUTOSAVE_KEY = 'autosave'

// dirty: 未保存の変更がある。markClean(ファイル保存・正常終了)で false
type AutosaveRecord = { savedAt: number; dirty: boolean; text: string }

export type RecoveryInfo = { savedAt: number; text: string }

export type AutosaveOptions = {
  store: DocumentStore
  history: History
  kv: KeyValueStore
  delayMs?: number // 最後の変更からこの時間で書く(既定 2000)
  snapshots?: SnapshotStore
  snapshotIntervalMs?: number // 自動スナップショットの最小間隔(既定 10 分)
  now?: () => number
  logger?: Logger
}

export function createAutosave(o: AutosaveOptions) {
  const delay = o.delayMs ?? 2000
  const snapInterval = o.snapshotIntervalMs ?? 10 * 60 * 1000
  const now = o.now ?? Date.now
  const log = o.logger ?? defaultLogger

  let timer: ReturnType<typeof setTimeout> | undefined
  let queue: Promise<void> = Promise.resolve()
  let lastSnapshot = now()
  let disposed = false

  // 書き込みを直列化(古い書き込みが後から上書きしない)
  function write(dirty: boolean, taskName: string): Promise<void> {
    const p = queue.then(() =>
      log.runTask(taskName, async () => {
        const doc = o.store.getState().doc
        const t = now()
        const record: AutosaveRecord = {
          savedAt: t,
          dirty,
          text: serializeProject(doc, { now: t }),
        }
        await o.kv.set(AUTOSAVE_KEY, JSON.stringify(record))
        if (dirty && o.snapshots && t - lastSnapshot >= snapInterval) {
          lastSnapshot = t
          await o.snapshots.create(doc, { kind: 'auto', label: 'autosave' })
        }
      }),
    )
    queue = p.catch(() => {})
    return p
  }

  const unsubscribe = o.history.subscribe(() => {
    if (disposed) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      write(true, 'autosave').catch(() => {}) // 失敗は runTask が実行ログに記録する
    }, delay)
  })

  return {
    // 待たずに今すぐ書く
    flush(): Promise<void> {
      clearTimeout(timer)
      timer = undefined
      return write(true, 'autosave')
    },
    // 保存済み扱いにする(ファイル保存・読込・正常終了の後に呼ぶ)
    markClean(): Promise<void> {
      clearTimeout(timer)
      timer = undefined
      return write(false, 'autosave: clean')
    },
    idle: () => queue,
    dispose() {
      disposed = true
      clearTimeout(timer)
      unsubscribe()
    },
  }
}

export type Autosave = ReturnType<typeof createAutosave>

// ---- 起動時の復旧 ----

// 未保存の変更が残っていれば復旧候補を返す(壊れていれば undefined)
export async function findRecovery(kv: KeyValueStore): Promise<RecoveryInfo | undefined> {
  const raw = await kv.get(AUTOSAVE_KEY)
  if (!raw) return undefined
  try {
    const rec = JSON.parse(raw) as Partial<AutosaveRecord>
    if (rec.dirty === true && typeof rec.text === 'string' && typeof rec.savedAt === 'number') {
      return { savedAt: rec.savedAt, text: rec.text }
    }
  } catch {
    /* 壊れた自動保存は候補にしない */
  }
  return undefined
}

export function loadRecovery(
  info: RecoveryInfo,
  logger: Logger = defaultLogger,
): Promise<ParsedProject> {
  return logger.runTask('recover project', () => parseProject(info.text))
}

export async function discardRecovery(kv: KeyValueStore): Promise<void> {
  await kv.delete(AUTOSAVE_KEY)
}
