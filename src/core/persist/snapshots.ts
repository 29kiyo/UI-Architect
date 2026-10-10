import { logger as defaultLogger, type Logger } from '@/shared'
import { newId, type Id, type UIDocument } from '../model'
import { parseProject, serializeProject, type ParsedProject } from './format'
import type { KeyValueStore } from './kv'

export type SnapshotMeta = { id: Id; kind: 'manual' | 'auto'; label: string; savedAt: number }

const META = 'snapshot-meta/'
const DATA = 'snapshot-data/'

// 一覧用の meta と本体(重い)を別キーにして、list で本体を読まない
export function createSnapshotStore(
  kv: KeyValueStore,
  options: { limit?: number; now?: () => number; logger?: Logger } = {},
) {
  const limit = options.limit ?? 30
  const now = options.now ?? Date.now
  const log = options.logger ?? defaultLogger

  async function list(): Promise<SnapshotMeta[]> {
    const keys = (await kv.keys()).filter((k) => k.startsWith(META))
    const out: SnapshotMeta[] = []
    for (const k of keys) {
      const raw = await kv.get(k)
      if (!raw) continue
      try {
        out.push(JSON.parse(raw) as SnapshotMeta)
      } catch {
        /* 壊れた meta は無視 */
      }
    }
    return out.sort((a, b) => b.savedAt - a.savedAt)
  }

  async function remove(id: Id): Promise<void> {
    await kv.delete(META + id)
    await kv.delete(DATA + id)
  }

  // 上限超過: 古い自動分から削除。自動が無ければ古い手動。今作った分は最後まで残す
  async function evict(keepId: Id): Promise<void> {
    const metas = (await list()).filter((m) => m.id !== keepId).reverse() // 古い順
    let excess = metas.length + 1 - limit
    const order = [
      ...metas.filter((m) => m.kind === 'auto'),
      ...metas.filter((m) => m.kind === 'manual'),
    ]
    for (const m of order) {
      if (excess-- <= 0) break
      await remove(m.id)
    }
  }

  async function create(
    doc: UIDocument,
    options: { kind: SnapshotMeta['kind']; label: string },
  ): Promise<SnapshotMeta> {
    return log.runTask(`snapshot: ${options.label}`, async () => {
      const meta: SnapshotMeta = {
        id: newId(),
        kind: options.kind,
        label: options.label,
        savedAt: now(),
      }
      await kv.set(DATA + meta.id, serializeProject(doc, { now: meta.savedAt }))
      await kv.set(META + meta.id, JSON.stringify(meta))
      await evict(meta.id)
      return meta
    })
  }

  async function load(id: Id): Promise<ParsedProject> {
    return log.runTask('load snapshot', async () => {
      const text = await kv.get(DATA + id)
      if (text === undefined) throw new Error(`snapshot not found: ${id}`)
      return parseProject(text)
    })
  }

  return { list, create, load, remove }
}

export type SnapshotStore = ReturnType<typeof createSnapshotStore>
