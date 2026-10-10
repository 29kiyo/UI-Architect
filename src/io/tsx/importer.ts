import {
  createNode,
  type ImportContext,
  type ImportInput,
  type ImportResult,
  type Importer,
  type Node,
} from '@/core'
import { fullProps } from '../html/convert'
import { readInputText } from '../input'
import { parseSource, type ParseMode } from './ast'
import { convertJsx, returnedJsx } from './jsx'
import { collectCandidates, indexTypes, propsOf } from './props'

export type TsxImporterOptions = { maxNodes?: number }

const DECLARE = /\bexport\s+declare\b|^\s*declare\s+(function|const|interface|type)\b/m

export function detectTsx(input: ImportInput): number {
  const text = readInputText(input)
  if (text === undefined) return 0
  const name = input.name ?? ''
  if (/\.d\.ts$/i.test(name)) return 0.95
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ''
  if (ext === 'tsx' || ext === 'jsx') return 0.95
  if (ext && !['ts', 'js', 'mjs', 'cjs', 'txt'].includes(ext)) return 0
  if (/^\s*(<!doctype|<html|<svg|<\?xml)/i.test(text)) return 0
  const hasModule = /^\s*(import|export)\s/m.test(text)
  if (hasModule && /<[A-Za-z][\w.]*[\s/>]/.test(text) && /(=>|return)/.test(text)) return 0.6
  if (DECLARE.test(text)) return 0.5
  return 0
}

function modeOf(input: ImportInput, text: string): ParseMode {
  const name = input.name ?? ''
  if (/\.d\.ts$/i.test(name)) return 'dts'
  if (/\.(tsx|jsx)$/i.test(name)) return 'tsx'
  return DECLARE.test(text) ? 'dts' : 'tsx'
}

export function createTsxImporter(options: TsxImporterOptions = {}): Importer {
  return {
    id: 'tsx',
    label: 'TSX/.d.ts',
    detect: detectTsx,
    async parse(input: ImportInput, ctx: ImportContext): Promise<ImportResult> {
      const text = readInputText(input)
      if (text === undefined) throw new Error('TSX のテキストを取得できません')
      const mode = modeOf(input, text)
      const src = parseSource(text, mode)
      ctx.signal?.throwIfAborted()

      const warnings: string[] = []
      if (src.errors > 0) warnings.push(`構文エラー ${src.errors} 件(回復して解析)`)

      const cx = { decls: indexTypes(src.program), code: text, warnings: new Set<string>() }
      const cands = collectCandidates(src.program)
      const withJsx =
        mode === 'tsx'
          ? cands.map((c) => ({ c, j: c.fn ? returnedJsx(c.fn) : undefined })).find((x) => x.j)
          : undefined
      const chosen = withJsx?.c ?? cands[0]
      if (!chosen) throw new Error('コンポーネントが見つかりません')

      const root = createNode({
        type: 'element',
        name: chosen.name,
        props: fullProps({
          custom: {
            sourceComponent: chosen.name,
            sourceKind: mode === 'tsx' ? 'tsx' : 'd.ts',
            componentProps: propsOf(chosen, cx),
          },
        }),
      })

      let nodes: Node[]
      if (withJsx?.j) {
        const r = convertJsx(withJsx.j, text, root, options.maxNodes ?? 5000)
        nodes = r.nodes
        warnings.push(...r.warnings)
      } else {
        const comp = createNode({
          type: 'element',
          name: chosen.name,
          props: fullProps({ custom: { tag: chosen.name, componentUse: true } }),
        })
        root.children.push(comp.id)
        nodes = [root, comp]
        if (mode === 'tsx')
          warnings.push('JSX を返す処理が見つからなかったため、props のみ取り込みました')
      }

      const others = cands.filter((c) => c !== chosen).map((c) => c.name)
      if (others.length > 0)
        warnings.push(`他のコンポーネント(${others.join(', ')})は取り込んでいません`)
      warnings.push(...cx.warnings)
      return { nodes, assets: [], tokens: {}, warnings }
    },
  }
}
