import {
  importerRegistry,
  type History,
  type ImportContext,
  type ImportInput,
  type ImportResult,
  type Importer,
} from '@/core'
import { createImportCommand, type CommitOptions } from './commit'
import { createDefaultImporters } from './defaults'
import { readInputText, type FetchFn } from './input'
import { filesFromInputs, resolveResources, type AssetData } from './resources'
import { sanitizeHtml } from './sanitize'
import { detectImporters, runImport } from './select'
import { arrangeResult } from './arrange'

const DEFAULT_WIDTH = 1280

export type PrepareOptions = {
  importerId?: string // 手動選択。省略時は最高 score
  width?: number // 対象デバイスの幅(HTML の描画幅)
  deviceId?: string
  baseUrl?: string
  allowNetwork?: boolean
  fetchFn?: FetchFn
  importers?: (ctx: { width: number }) => Importer[] // テスト/差し替え用
  arrange?: boolean // 自動分類・レイアウト推定(既定 true)
  signal?: AbortSignal
}

export type Candidate = { id: string; label: string; score: number }
export type Analysis = {
  primary: number // 取り込み対象の入力の index(無ければ -1)
  candidates: Candidate[] // 対象入力に対する各 Importer の score(高い順)
  scores: number[] // 入力ごとの最高 score
}
export type Prepared = {
  importerId: string
  result: ImportResult
  assetData: Map<string, AssetData>
  ignored: string[]
  beforeHtml?: string // 取り込み元の(サニタイズ済み)HTML。比較表示用。HTML のみ
}

function importersFor(o: Pick<PrepareOptions, 'importers' | 'width'>): Importer[] {
  const width = o.width ?? DEFAULT_WIDTH
  if (o.importers) return o.importers({ width })
  const builtin = createDefaultImporters({ width })
  const ids = new Set(builtin.map((i) => i.id))
  return [...builtin, ...importerRegistry.list().filter((i) => !ids.has(i.id))]
}

const labelOf = (n: number, name?: string) => name ?? `#${n + 1}`

function analyze(inputs: ImportInput[], importers: Importer[]): Analysis {
  const scores = inputs.map((i) => detectImporters(i, importers)[0]?.score ?? 0)
  let primary = -1
  let best = 0
  scores.forEach((s, i) => {
    if (s > best) {
      best = s
      primary = i
    }
  })
  const target = inputs[primary < 0 ? 0 : primary]
  if (!target) return { primary, candidates: [], scores }
  const detected = detectImporters(target, importers)
  const seen = new Set(detected.map((d) => d.importer.id))
  const candidates: Candidate[] = [
    ...detected.map((d) => ({ id: d.importer.id, label: d.importer.label, score: d.score })),
    ...importers
      .filter((i) => !seen.has(i.id))
      .map((i) => ({ id: i.id, label: i.label, score: 0 })),
  ]
  return { primary, candidates, scores }
}

export function analyzeInputs(
  inputs: ImportInput[],
  options: Pick<PrepareOptions, 'importers' | 'width'> = {},
): Analysis {
  return analyze(inputs, importersFor(options))
}

// 入力 → 検出 → 変換 → 外部リソース解決。ドキュメントはまだ変更しない(プレビュー用)
export async function prepareImport(
  inputs: ImportInput[],
  options: PrepareOptions = {},
): Promise<Prepared> {
  if (inputs.length === 0) throw new Error('入力がありません')
  const importers = importersFor(options)
  const analysis = analyze(inputs, importers)
  if (analysis.primary < 0 && !options.importerId) {
    throw new Error('対応する Importer が見つかりません')
  }
  const idx = analysis.primary < 0 ? 0 : analysis.primary
  const primary = inputs[idx]

  const ctx: ImportContext = {
    ...(options.deviceId ? { deviceId: options.deviceId } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  }
  const run = await runImport(primary, ctx, {
    importers,
    ...(options.importerId ? { importerId: options.importerId } : {}),
  })

  const others = inputs.filter((_, i) => i !== idx)
  const ignored = inputs.flatMap((i, n) =>
    n !== idx && analysis.scores[n] > 0 ? [labelOf(n, i.name)] : [],
  )
  const baseUrl = options.baseUrl ?? primary.url
  const resolved = await resolveResources(run.result, {
    files: filesFromInputs(others),
    ...(baseUrl ? { baseUrl } : {}),
    ...(options.allowNetwork !== undefined ? { allowNetwork: options.allowNetwork } : {}),
    ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  })

  const warnings = [
    ...resolved.result.warnings,
    ...ignored.map((n) => `別の文書 ${n} は取り込んでいません(1回の取り込みは1文書)`),
  ]
  let beforeHtml: string | undefined
  if (run.importerId === 'html') {
    const t = readInputText(primary)
    if (t !== undefined) {
      try {
        beforeHtml = sanitizeHtml(t, globalThis.window).html
      } catch {
        beforeHtml = undefined // 比較表示なしで続行
      }
    }
  }
  return {
    importerId: run.importerId,
    ...(beforeHtml !== undefined ? { beforeHtml } : {}),
    result:
      options.arrange === false
        ? { ...resolved.result, warnings }
        : await arrangeResult(
            { ...resolved.result, warnings },
            { deviceWidth: options.width ?? DEFAULT_WIDTH },
          ),
    assetData: resolved.assetData,
    ignored,
  }
}

// 確定 = 1 Command(Undo 1回で全取り消し)
export function commitPrepared(
  history: History,
  prepared: Prepared,
  options: CommitOptions = {},
): boolean {
  return history.execute(createImportCommand(prepared.result, options))
}

export type OutlineRow = { depth: number; text: string }

// プレビュー用のノード木(深さ優先。limit 件まで)
export function outlineOf(
  result: ImportResult,
  limit = 300,
): { rows: OutlineRow[]; total: number } {
  const byId = new Map(result.nodes.map((n) => [n.id, n]))
  const rows: OutlineRow[] = []
  const stack: { id: string; depth: number }[] = [{ id: result.nodes[0]?.id ?? '', depth: 0 }]
  while (stack.length > 0 && rows.length < limit) {
    const { id, depth } = stack.pop() as { id: string; depth: number }
    const n = byId.get(id)
    if (!n) continue
    const text = n.props.content.text
    const snippet = typeof text === 'string' && text ? ` "${text.slice(0, 30)}"` : ''
    rows.push({ depth, text: `${n.name} [${n.type}]${snippet}${n.hidden ? ' (hidden)' : ''}` })
    for (let i = n.children.length - 1; i >= 0; i--) {
      stack.push({ id: n.children[i], depth: depth + 1 })
    }
  }
  return { rows, total: result.nodes.length }
}
