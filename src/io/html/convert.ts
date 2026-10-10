import { createNode, PROP_GROUP_KEYS, type Node, type PropGroup, type Props } from '@/core'
import { mapComputedStyle, type MappedProps, type StyleGetter } from './style'

export type Rect = { x: number; y: number; width: number; height: number }

// 描画済み DOM から値を取り出す口(本番: sandbox iframe / テスト: jsdom)
export type ConvertSource = {
  root: Element // 変換対象のルート(この子要素から変換)
  getStyle(el: Element): StyleGetter
  getRect(el: Element): Rect | null // ルート左上基準
  getStates?(el: Element): PropGroup // 擬似クラス(hover 等)→ props.states
}
export type ConvertOptions = { rootName?: string; maxNodes?: number }
export type ConvertResult = { nodes: Node[]; warnings: string[] }

const DEFAULT_MAX_NODES = 5000
const SKIP_TAGS = new Set([
  'style',
  'script',
  'noscript',
  'title',
  'head',
  'meta',
  'link',
  'br',
  'template',
])
const UNSUPPORTED = new Set(['video', 'audio', 'canvas', 'picture', 'map'])

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const round = (n: number) => Math.round(n * 100) / 100

export function fullProps(parts: MappedProps): Props {
  const out: Record<string, PropGroup> = {}
  for (const k of PROP_GROUP_KEYS) out[k] = { ...(parts[k] ?? {}) }
  return out as Props
}

function contentOf(el: Element, tag: string): PropGroup {
  const c: PropGroup = {}
  const attr = (n: string) => el.getAttribute(n)
  if (tag === 'img') {
    const src = attr('data-ua-src') ?? attr('src')
    if (src) c.src = src
    const alt = attr('alt')
    if (alt !== null) c.alt = alt
  }
  if (tag === 'a') {
    const href = attr('href')
    if (href) c.href = href
  }
  if (tag === 'input') {
    c.inputType = attr('type') ?? 'text'
    const value = attr('value')
    if (value !== null) c.value = value
  }
  if (tag === 'input' || tag === 'textarea') {
    const ph = attr('placeholder')
    if (ph) c.placeholder = ph
  }
  return c
}

function customOf(el: Element, tag: string, rect: Rect | null): PropGroup {
  const c: PropGroup = { tag }
  const id = el.getAttribute('id')
  if (id) c.id = id
  const cls = el.getAttribute('class')?.trim()
  if (cls) c.className = cls
  const role = el.getAttribute('role')
  if (role) c.role = role
  const label = el.getAttribute('aria-label')
  if (label) c.ariaLabel = label
  if (rect && (rect.width > 0 || rect.height > 0)) {
    c.sourceRect = {
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
    }
  }
  return c
}

function nameOf(el: Element, tag: string): string {
  const id = el.getAttribute('id')
  if (id) return `${tag}#${id}`
  const cls = el.getAttribute('class')?.trim().split(/\s+/)[0]
  return cls ? `${tag}.${cls}` : tag
}

// 規約: nodes[0] がルート。以降は深さ優先の前順
export function convertDom(source: ConvertSource, options: ConvertOptions = {}): ConvertResult {
  const max = options.maxNodes ?? DEFAULT_MAX_NODES
  const nodes: Node[] = []
  const unsupported = new Map<string, number>()
  let truncated = false

  const root = createNode({
    type: 'element',
    name: options.rootName ?? 'Imported',
    props: fullProps({}),
  })
  nodes.push(root)

  const attach = (parent: Node, node: Node) => {
    parent.children.push(node.id)
    nodes.push(node)
  }

  function walkChildren(el: Element, parent: Node) {
    for (const child of Array.from(el.childNodes)) {
      if (nodes.length >= max) {
        truncated = true
        return
      }
      if (child.nodeType === 3) {
        const text = norm(child.textContent ?? '')
        if (text) {
          attach(
            parent,
            createNode({ type: 'text', name: 'text', props: fullProps({ content: { text } }) }),
          )
        }
      } else if (child.nodeType === 1) {
        walkElement(child as Element, parent)
      }
    }
  }

  function walkElement(el: Element, parent: Node) {
    const tag = el.localName.toLowerCase()
    if (SKIP_TAGS.has(tag)) return
    const get = source.getStyle(el)
    const styles = mapComputedStyle(get)
    const content = contentOf(el, tag)
    const hasChildEls = Array.from(el.children).some(
      (c) => !SKIP_TAGS.has(c.localName.toLowerCase()),
    )

    let type = 'element'
    if (tag === 'img') type = 'image'
    else if (tag === 'svg') {
      type = 'svg'
      content.svg = el.outerHTML
    }
    if (UNSUPPORTED.has(tag)) unsupported.set(tag, (unsupported.get(tag) ?? 0) + 1)

    if (type === 'element' && !hasChildEls) {
      const text = norm(el.textContent ?? '')
      if (text) content.text = text
    }

    const node = createNode({
      type,
      name: nameOf(el, tag),
      hidden: get('display') === 'none',
      props: fullProps({
        ...styles,
        content: { ...(styles.content ?? {}), ...content },
        states: source.getStates?.(el) ?? {},
        custom: customOf(el, tag, source.getRect(el)),
      }),
    })
    attach(parent, node)
    if (type === 'element' && hasChildEls) walkChildren(el, node)
  }

  walkChildren(source.root, root)

  const warnings = [...unsupported].map(
    ([t, n]) => `<${t}> は未対応のため汎用コンテナとして取り込み(${n} 件)`,
  )
  if (truncated) warnings.push(`ノード数が上限(${max})を超えたため一部を取り込んでいません`)
  return { nodes, warnings }
}
