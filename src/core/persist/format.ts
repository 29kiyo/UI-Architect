import { z } from 'zod'
import { findVariableIssues } from '../data'
import { migrateDocument } from './migrations'
import { CURRENT_SCHEMA_VERSION, UIDocumentSchema, type UIDocument } from '../model'

export const PROJECT_FORMAT = 'ui-architect'

const EnvelopeSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  schemaVersion: z.number().int().positive(),
  savedAt: z.number().optional(),
  doc: z.unknown(),
})

export class ProjectLoadError extends Error {
  issues: string[]
  constructor(message: string, issues: string[] = []) {
    super(message)
    this.name = 'ProjectLoadError'
    this.issues = issues
  }
}

// 2-H で差し込む。古い schemaVersion の生データを現行形式へ変換する
export type Migrator = (raw: unknown, fromVersion: number) => unknown

export type ParsedProject = { doc: UIDocument; warnings: string[] }

export function serializeProject(
  doc: UIDocument,
  options: { pretty?: boolean; now?: number } = {},
): string {
  const envelope = {
    format: PROJECT_FORMAT,
    schemaVersion: doc.schemaVersion,
    savedAt: options.now ?? Date.now(),
    doc,
  }
  return JSON.stringify(envelope, null, options.pretty ? 2 : undefined)
}

// 失敗時は ProjectLoadError。warnings は読めるが整合性に問題がある点(変数の重複など)
export function parseProject(
  text: string,
  options: { migrate?: Migrator; currentVersion?: number } = {},
): ParsedProject {
  const currentVersion = options.currentVersion ?? CURRENT_SCHEMA_VERSION
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new ProjectLoadError('invalid JSON')
  }
  const env = EnvelopeSchema.safeParse(json)
  if (!env.success) throw new ProjectLoadError('not a UI-Architect project file')
  const { schemaVersion, doc: rawDoc } = env.data
  if (schemaVersion > currentVersion) {
    throw new ProjectLoadError(
      `project was saved by a newer version (schemaVersion ${schemaVersion})`,
    )
  }
  let raw: unknown = rawDoc
  if (schemaVersion < currentVersion) {
    try {
      raw = (options.migrate ?? migrateDocument)(rawDoc, schemaVersion)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new ProjectLoadError(`migration failed (schemaVersion ${schemaVersion}): ${msg}`)
    }
  }
  const parsed = UIDocumentSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ProjectLoadError(
      'invalid project data',
      parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.')}: ${i.message}`),
    )
  }
  if (parsed.data.schemaVersion !== currentVersion) {
    throw new ProjectLoadError('schemaVersion mismatch after migration')
  }
  return { doc: parsed.data, warnings: findVariableIssues(parsed.data) }
}
