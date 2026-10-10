import { describe, expect, it } from 'vitest'
import { createEmptyDocument } from '../model'
import {
  MIGRATIONS,
  ProjectLoadError,
  createMigrator,
  migrateDocument,
  parseProject,
  serializeProject,
  type Migration,
} from './index'

type Raw = { project: { name: string }; extra?: number }
const step = (from: number, fn: (r: Raw) => Raw): Migration => ({
  from,
  to: from + 1,
  migrate: (raw) => fn(raw as Raw),
})

describe('createMigrator', () => {
  it('順に適用し、各ステップ後に schemaVersion を更新する', () => {
    const m = createMigrator(
      [
        step(1, (r) => ({ ...r, extra: 1 })),
        step(2, (r) => ({ ...r, extra: (r.extra ?? 0) + 10 })),
      ],
      3,
    )
    expect(m({ project: { name: 'a' } }, 1)).toEqual({
      project: { name: 'a' },
      extra: 11,
      schemaVersion: 3,
    })
    expect(m({ project: { name: 'a' }, extra: 5 }, 2)).toMatchObject({
      extra: 15,
      schemaVersion: 3,
    })
  })

  it('途中の版が無い・現行版と同じ場合', () => {
    const m = createMigrator([step(2, (r) => r)], 3)
    expect(() => m({}, 1)).toThrow(/no migration from schemaVersion 1/)
    const same = { a: 1 }
    expect(createMigrator([], 1)(same, 1)).toBe(same)
  })

  it('登録時に不正な定義を拒否する', () => {
    expect(() => createMigrator([{ from: 1, to: 3, migrate: (r) => r }])).toThrow()
    expect(() => createMigrator([step(1, (r) => r), step(1, (r) => r)])).toThrow(/duplicate/)
  })

  it('実データ用の MIGRATIONS は現行版に対して整合している', () => {
    expect(() => createMigrator(MIGRATIONS)).not.toThrow()
    expect(migrateDocument({}, 1)).toEqual({})
  })
})

describe('parseProject + migration', () => {
  const text = serializeProject(createEmptyDocument('doc'))

  it('古い版を移行して読み込める', () => {
    const migrate = createMigrator(
      [step(1, (r) => ({ ...r, project: { ...r.project, name: r.project.name + '-v2' } }))],
      2,
    )
    const { doc } = parseProject(text, { currentVersion: 2, migrate })
    expect(doc.schemaVersion).toBe(2)
    expect(doc.project.name).toBe('doc-v2')
  })

  it('移行が無い / 失敗した場合は ProjectLoadError', () => {
    expect(() => parseProject(text, { currentVersion: 2 })).toThrow(ProjectLoadError)
    const boom = createMigrator(
      [
        step(1, () => {
          throw new Error('boom')
        }),
      ],
      2,
    )
    expect(() => parseProject(text, { currentVersion: 2, migrate: boom })).toThrow(
      /migration failed.*boom/,
    )
  })

  it('移行後も不正なデータは拒否される', () => {
    const broken = createMigrator([step(1, () => ({ project: {} }) as Raw)], 2)
    expect(() => parseProject(text, { currentVersion: 2, migrate: broken })).toThrow(
      ProjectLoadError,
    )
  })
})
