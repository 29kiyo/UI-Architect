import {
  createNode,
  type ImportContext,
  type ImportInput,
  type ImportResult,
  type Importer,
} from '@/core'
import { fullProps } from '../html/convert'
import { readInputText } from '../input'
import { sanitizeHtml, type DomWindow } from '../sanitize'

export type SvgImporterOptions = { getWindow?: () => DomWindow }

const SVG_START = /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/i

export function detectSvg(input: ImportInput): number {
  const text = readInputText(input)
  if (text === undefined) return 0
  const ext = /\.([a-z0-9]+)$/i.exec(input.name ?? '')?.[1]?.toLowerCase() ?? ''
  const mime = (input.mime ?? '').split(';')[0].trim().toLowerCase()
  const looksSvg = SVG_START.test(text)
  if (ext === 'svg' || mime === 'image/svg+xml') return looksSvg ? 0.95 : 0.3
  return looksSvg ? 0.9 : 0
}

// 数値(px 付き可)のみ。%・em 等は undefined
const lengthPx = (v: string | null): number | undefined => {
  const m = v ? /^\s*(\d+(?:\.\d+)?)(px)?\s*$/.exec(v) : null
  return m ? Number(m[1]) : undefined
}

function viewBoxSize(v: string | null): { w: number; h: number } | undefined {
  if (!v) return undefined
  const n = v
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x)) || n[2] <= 0 || n[3] <= 0) {
    return undefined
  }
  return { w: n[2], h: n[3] }
}

export function createSvgImporter(options: SvgImporterOptions = {}): Importer {
  return {
    id: 'svg',
    label: 'SVG',
    detect: detectSvg,
    async parse(input: ImportInput, ctx: ImportContext): Promise<ImportResult> {
      const text = readInputText(input)
      if (text === undefined) throw new Error('SVGのテキストを取得できません')
      const win = (options.getWindow ?? (() => globalThis.window))()
      const clean = sanitizeHtml(text, win)
      ctx.signal?.throwIfAborted()

      const doc = new win.DOMParser().parseFromString(
        `<!doctype html><body>${clean.html}`,
        'text/html',
      )
      const svgs = Array.from(doc.body.children).filter((e) => e.localName.toLowerCase() === 'svg')
      if (svgs.length === 0) throw new Error('SVG要素が見つかりません(サニタイズ後)')
      const warnings = [...clean.warnings]
      if (svgs.length > 1)
        warnings.push(`SVG が ${svgs.length} 個あります。先頭の1つのみ取り込みました`)

      const el = svgs[0]
      const viewBox = el.getAttribute('viewBox') ?? el.getAttribute('viewbox')
      const vb = viewBoxSize(viewBox)
      const w = lengthPx(el.getAttribute('width')) ?? vb?.w
      const h = lengthPx(el.getAttribute('height')) ?? vb?.h
      if (w === undefined || h === undefined) warnings.push('SVG のサイズを特定できませんでした')

      const size: Record<string, string> = {}
      if (w !== undefined) size.width = `${w}px`
      if (h !== undefined) size.height = `${h}px`
      const custom: Record<string, string> = { tag: 'svg' }
      if (viewBox) custom.viewBox = viewBox

      const svg = createNode({
        type: 'svg',
        name: 'svg',
        props: fullProps({ size, content: { svg: el.outerHTML }, custom }),
      })
      const root = createNode({
        type: 'element',
        name: input.name ?? 'Imported',
        props: fullProps({}),
        children: [svg.id],
      })
      return { nodes: [root, svg], assets: [], tokens: {}, warnings }
    },
  }
}
