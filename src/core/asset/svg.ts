import createDOMPurify from 'dompurify'
import { createNode, PropsSchema, type Node } from '../model'
import { fitSize } from './imageNode'

type DomWindow = Window & typeof globalThis

export type SvgInfo = {
  svg: string
  width?: number
  height?: number
  viewBox?: string
  warnings: string[]
}

const COLOR_OK = /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\(\s*[\d.\s,%]+\))$/i
const EXT_URL = /url\(\s*(['"]?)(?!#|data:)[^)]*\1\s*\)/gi
const isExternal = (v: string) => {
  const t = v.trim()
  return !(t === '' || t.startsWith('#') || /^data:image\//i.test(t))
}

// 描画用: currentColor を実際の色に置換(<img> 内では外側の color を継承できないため)
export function applySvgColor(svg: string, color: string): string {
  const c = COLOR_OK.test(color.trim()) ? color.trim() : '#000000'
  return svg.replace(/currentColor/gi, c)
}

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
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x)) || n[2] <= 0 || n[3] <= 0)
    return undefined
  return { w: n[2], h: n[3] }
}

function parseSvgRoot(markup: string, win: DomWindow): Element | undefined {
  const doc = new win.DOMParser().parseFromString(`<!doctype html><body>${markup}`, 'text/html')
  return doc.body.querySelector('svg') ?? undefined
}

// SVG を無害化して 1 つの <svg> 文字列にする。svg が無ければ throw
export function sanitizeSvg(text: string, win: DomWindow = globalThis.window): SvgInfo {
  const purify = createDOMPurify(win)
  const clean = String(
    purify.sanitize(text, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['srcdoc'],
    }),
  )
  const root = parseSvgRoot(clean, win)
  if (!root) throw new Error('SVG要素が見つかりません(サニタイズ後)')

  const warnings: string[] = []
  let external = 0
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const name of ['href', 'xlink:href']) {
      const v = el.getAttribute(name)
      if (v !== null && isExternal(v)) {
        el.removeAttribute(name)
        external++
      }
    }
    for (const a of Array.from(el.attributes)) {
      if (/url\(/i.test(a.value) && EXT_URL.test(a.value)) {
        EXT_URL.lastIndex = 0
        el.setAttribute(a.name, a.value.replace(EXT_URL, 'none'))
        external++
      }
      EXT_URL.lastIndex = 0
    }
    if (el.localName === 'style' && el.textContent && /url\(/i.test(el.textContent)) {
      el.textContent = el.textContent.replace(EXT_URL, 'none')
      external++
    }
  }
  if (external > 0) warnings.push(`外部参照 ${external} 件を除去`)

  const viewBox = root.getAttribute('viewBox') ?? root.getAttribute('viewbox') ?? undefined
  const vb = viewBoxSize(viewBox ?? null)
  const width = lengthPx(root.getAttribute('width')) ?? vb?.w
  const height = lengthPx(root.getAttribute('height')) ?? vb?.h
  if (width === undefined || height === undefined)
    warnings.push('SVG のサイズを特定できませんでした')
  return {
    svg: root.outerHTML,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(viewBox ? { viewBox } : {}),
    warnings,
  }
}

const NO_PAINT = /^(none|currentcolor|inherit|transparent|url\(.*\))$/i

// 単色の SVG だけ fill/stroke を currentColor に置換する(多色は変更しない)
export function toCurrentColor(
  svg: string,
  win: DomWindow = globalThis.window,
): { svg: string; converted: boolean } {
  const root = parseSvgRoot(svg, win)
  if (!root) return { svg, converted: false }
  const els = [root, ...Array.from(root.querySelectorAll('*'))]
  const styleRe = /(^|;)\s*(fill|stroke)\s*:\s*([^;]+)/gi
  const colors = new Set<string>()
  let hasFill = false
  for (const el of els) {
    if (el.hasAttribute('fill')) hasFill = true
    for (const n of ['fill', 'stroke']) {
      const v = el.getAttribute(n)?.trim()
      if (v && !NO_PAINT.test(v)) colors.add(v.toLowerCase())
    }
    const st = el.getAttribute('style') ?? ''
    for (const m of st.matchAll(styleRe)) {
      if (m[2].toLowerCase() === 'fill') hasFill = true
      const v = m[3].trim()
      if (!NO_PAINT.test(v)) colors.add(v.toLowerCase())
    }
  }
  if (colors.size > 1) return { svg, converted: false }
  if (colors.size === 0) {
    if (hasFill) return { svg, converted: false }
    root.setAttribute('fill', 'currentColor') // 既定の黒塗りを色変更できるように
    return { svg: root.outerHTML, converted: true }
  }
  for (const el of els) {
    for (const n of ['fill', 'stroke']) {
      const v = el.getAttribute(n)?.trim()
      if (v && !NO_PAINT.test(v)) el.setAttribute(n, 'currentColor')
    }
    const st = el.getAttribute('style')
    if (st) {
      el.setAttribute(
        'style',
        st.replace(styleRe, (m, pre: string, prop: string, v: string) =>
          NO_PAINT.test(v.trim()) ? m : `${pre}${prop}:currentColor`,
        ),
      )
    }
  }
  return { svg: root.outerHTML, converted: true }
}

export function createSvgNode(info: SvgInfo, name: string): Node {
  const { width, height } = fitSize(info.width ?? 0, info.height ?? 0, 64)
  return createNode({
    type: 'svg',
    category: 'icon',
    name,
    props: PropsSchema.parse({
      size: { width: `${width}px`, height: `${height}px` },
      content: { svg: info.svg },
      custom: { tag: 'svg', ...(info.viewBox ? { viewBox: info.viewBox } : {}) },
    }),
  })
}
