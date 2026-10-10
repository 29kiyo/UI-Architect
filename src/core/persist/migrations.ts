import { CURRENT_SCHEMA_VERSION } from '../model'
import type { Migrator } from './format'

// 1 ステップ = 1 バージョン上げる(from → from + 1)。raw は検証前の生データ。
export type Migration = { from: number; to: number; migrate: (raw: unknown) => unknown }

// スキーマを変えるたびにここへ追記する(CURRENT_SCHEMA_VERSION も上げる)
export const MIGRATIONS: Migration[] = []

export function createMigrator(
  migrations: Migration[],
  currentVersion: number = CURRENT_SCHEMA_VERSION,
): Migrator {
  const byFrom = new Map<number, Migration>()
  for (const m of migrations) {
    if (m.to !== m.from + 1) throw new Error(`migration must go ${m.from} -> ${m.from + 1}`)
    if (byFrom.has(m.from)) throw new Error(`duplicate migration from ${m.from}`)
    byFrom.set(m.from, m)
  }
  return (raw, fromVersion) => {
    let cur = raw
    for (let v = fromVersion; v < currentVersion; v++) {
      const m = byFrom.get(v)
      if (!m) throw new Error(`no migration from schemaVersion ${v}`)
      cur = m.migrate(cur)
      if (cur !== null && typeof cur === 'object' && !Array.isArray(cur)) {
        cur = { ...cur, schemaVersion: m.to }
      }
    }
    return cur
  }
}

export const migrateDocument: Migrator = createMigrator(MIGRATIONS)
