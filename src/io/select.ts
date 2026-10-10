import {
  importerRegistry,
  type ImportContext,
  type ImportInput,
  type ImportResult,
  type Importer,
} from '@/core'
import { logger } from '@/shared'

export type Detection = { importer: Importer; score: number }

const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

// score > 0 の Importer を高い順に返す(同点は登録順)。detect が throw した場合は 0 扱い
export function detectImporters(
  input: ImportInput,
  importers: Importer[] = importerRegistry.list(),
): Detection[] {
  return importers
    .map((importer) => {
      try {
        return { importer, score: clamp(importer.detect(input)) }
      } catch {
        return { importer, score: 0 }
      }
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
}

export type RunImportOptions = {
  importerId?: string // 手動選択。省略時は最高 score を自動採用
  importers?: Importer[]
}

export type RunImportOutput = { importerId: string; result: ImportResult }

// 規約: result.nodes[0] がルートノード
export async function runImport(
  input: ImportInput,
  ctx: ImportContext = {},
  options: RunImportOptions = {},
): Promise<RunImportOutput> {
  const importers = options.importers ?? importerRegistry.list()
  return logger.runTask(`import: ${input.name ?? input.url ?? input.kind}`, async () => {
    let importer: Importer | undefined
    if (options.importerId) {
      importer = importers.find((i) => i.id === options.importerId)
      if (!importer) throw new Error(`importer not found: ${options.importerId}`)
    } else {
      importer = detectImporters(input, importers)[0]?.importer
      if (!importer) throw new Error('対応する Importer が見つかりません')
    }
    const result = await importer.parse(input, ctx)
    return { importerId: importer.id, result }
  })
}
