export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export type LogEntry = {
  id: number
  time: number
  level: LogLevel
  message: string
  // task の場合のみ
  taskId?: number
  taskName?: string
  status?: 'running' | 'done' | 'error'
  durationMs?: number
}

export type Logger = ReturnType<typeof createLogger>

export function createLogger(options: { capacity?: number; now?: () => number } = {}) {
  const capacity = options.capacity ?? 200
  const now = options.now ?? (() => Date.now())
  let level: LogLevel = 'info'
  let nextId = 1
  let entries: LogEntry[] = []
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach((l) => l())
  const push = (e: LogEntry) => {
    // 新しい配列を作る(useSyncExternalStore が変更を検出できるように)
    entries = [...entries, e].slice(-capacity)
    emit()
  }
  const replace = (id: number, patch: Partial<LogEntry>) => {
    entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e))
    emit()
  }

  const log = (lv: LogLevel, message: string) => {
    if (ORDER[lv] < ORDER[level]) return
    push({ id: nextId++, time: now(), level: lv, message })
  }

  // task は logLevel に関係なく常に記録する(実行中コマンド表示用)
  const startTask = (name: string) => {
    const id = nextId++
    const start = now()
    push({
      id,
      time: start,
      level: 'info',
      message: name,
      taskId: id,
      taskName: name,
      status: 'running',
    })
    return {
      done: () => replace(id, { status: 'done', durationMs: now() - start }),
      fail: (err?: unknown) =>
        replace(id, {
          status: 'error',
          level: 'error',
          durationMs: now() - start,
          message: err ? `${name}: ${String(err)}` : name,
        }),
    }
  }

  const runTask = async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
    const t = startTask(name)
    try {
      const result = await fn()
      t.done()
      return result
    } catch (err) {
      t.fail(err)
      throw err
    }
  }

  return {
    debug: (m: string) => log('debug', m),
    info: (m: string) => log('info', m),
    warn: (m: string) => log('warn', m),
    error: (m: string) => log('error', m),
    startTask,
    runTask,
    setLevel: (lv: LogLevel) => {
      level = lv
    },
    getLevel: () => level,
    getEntries: () => entries,
    clear: () => {
      entries = []
      emit()
    },
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}

export const logger = createLogger()
