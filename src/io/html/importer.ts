import type { ImportContext, ImportInput, ImportResult, Importer } from '@/core'
import { isTextLike } from '../input'
import { sanitizeHtml, type DomWindow } from '../sanitize'
import { convertDom, type ConvertSource } from './convert'
import { buildStateResolver } from './states'

export type RenderedDocument = ConvertSource & { dispose(): void }
export type HtmlRenderer = (
  html: string,
  ctx: { signal?: AbortSignal },
) => Promise<RenderedDocument>

export type HtmlImporterOptions = {
  render: HtmlRenderer
  getWindow?: () => DomWindow // サニタイズ用。既定は globalThis.window
  maxNodes?: number
}

const NON_HTML_EXTS = [
  'tsx',
  'jsx',
  'ts',
  'js',
  'mjs',
  'cjs',
  'vue',
  'svelte',
  'dart',
  'swift',
  'kt',
]

function readText(input: ImportInput): string | undefined {
  if (input.text !== undefined) return input.text
  if (input.data && isTextLike(input.name, input.mime)) {
    return new TextDecoder('utf-8').decode(input.data)
  }
  return undefined
}

export function detectHtml(input: ImportInput): number {
  const text = readText(input)
  if (text === undefined) return 0
  const ext = /\.([a-z0-9]+)$/i.exec(input.name ?? '')?.[1]?.toLowerCase() ?? ''
  const mime = (input.mime ?? '').split(';')[0].trim().toLowerCase()
  if (NON_HTML_EXTS.includes(ext)) return 0
  if (ext === 'svg' || mime === 'image/svg+xml') return 0.1
  if (ext === 'html' || ext === 'htm' || mime === 'text/html') return 0.9
  if (/^\s*(<!doctype html|<html[\s>])/i.test(text)) return 0.9
  if (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text)) return 0.1
  if (/^\s*(import|export)\s/m.test(text)) return 0.1
  if (/<[a-z][a-z0-9-]*(\s[^>]*)?>/i.test(text)) return 0.5
  return 0
}

export function createHtmlImporter(options: HtmlImporterOptions): Importer {
  return {
    id: 'html',
    label: 'HTML/CSS',
    detect: detectHtml,
    async parse(input: ImportInput, ctx: ImportContext): Promise<ImportResult> {
      const text = readText(input)
      if (text === undefined) throw new Error('HTMLのテキストを取得できません')
      const win = (options.getWindow ?? (() => globalThis.window))()
      const clean = sanitizeHtml(text, win)
      ctx.signal?.throwIfAborted()
      const doc = await options.render(clean.html, ctx.signal ? { signal: ctx.signal } : {})
      try {
        const states = buildStateResolver(doc.root)
        const converted = convertDom(
          { ...doc, getStates: states.getStates },
          {
            ...(input.name ? { rootName: input.name } : {}),
            ...(options.maxNodes !== undefined ? { maxNodes: options.maxNodes } : {}),
          },
        )
        return {
          nodes: converted.nodes,
          assets: [],
          tokens: {},
          warnings: [...clean.warnings, ...states.warnings, ...converted.warnings],
        }
      } finally {
        doc.dispose()
      }
    },
  }
}
