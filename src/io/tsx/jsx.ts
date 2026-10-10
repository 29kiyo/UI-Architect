import { createNode, type Node, type PropGroup } from '@/core'
import { fullProps } from '../html/convert'
import { isMappedCssName, mapComputedStyle, styleGetterFrom, type MappedProps } from '../html/style'
import { child, flag, list, snippet, staticValue, str, type AstNode } from './ast'

type TextItem = { kind: 'text'; text: string; binding?: string }
type Item = TextItem | { kind: 'node'; node: Node }
type Cond = { expr: string; hidden: boolean }
type Ctx = {
  code: string
  nodes: Node[]
  max: number
  truncated: boolean
  dynamic: number
  lists: number
  unknown: Set<string>
  unmappedStyle: number
  dynamicStyle: number
}

const SIDES = ['top', 'right', 'bottom', 'left']
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left']
const UNITLESS = new Set([
  'opacity',
  'zIndex',
  'flexGrow',
  'flexShrink',
  'lineHeight',
  'fontWeight',
  'order',
  'aspectRatio',
])
const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

function box(v: string): string[] | undefined {
  const t = v.trim().split(/\s+/)
  if (t.length === 1) return [t[0], t[0], t[0], t[0]]
  if (t.length === 2) return [t[0], t[1], t[0], t[1]]
  if (t.length === 3) return [t[0], t[1], t[2], t[1]]
  if (t.length === 4) return t
  return undefined
}

// React の style キー → CSS 個別プロパティ(ショートハンドは可能な範囲で展開)
function expandStyle(key: string, value: string, out: Record<string, string>) {
  const plain = !value.includes('(')
  if ((key === 'padding' || key === 'margin') && plain) {
    const b = box(value)
    if (b) {
      SIDES.forEach((s, i) => (out[`${key}-${s}`] = b[i]))
      return
    }
  }
  if (key === 'borderRadius' && plain) {
    const b = box(value)
    if (b) {
      CORNERS.forEach((c, i) => (out[`border-${c}-radius`] = b[i]))
      return
    }
  }
  if (key === 'gap' && plain) {
    const t = value.trim().split(/\s+/)
    out['row-gap'] = t[0]
    out['column-gap'] = t[1] ?? t[0]
    return
  }
  if (key === 'border' && plain) {
    const t = value.trim().split(/\s+/)
    if (t.length >= 2) {
      for (const s of SIDES) {
        out[`border-${s}-width`] = t[0]
        out[`border-${s}-style`] = t[1]
        if (t[2]) out[`border-${s}-color`] = t.slice(2).join(' ')
      }
      return
    }
  }
  if (key === 'background') {
    if (/^(linear|radial|conic)-gradient\(|^url\(/i.test(value)) {
      out['background-image'] = value
      return
    }
    if (plain && !value.includes(' ')) {
      out['background-color'] = value
      return
    }
  }
  out[kebab(key)] = value
}

function styleFrom(obj: AstNode) {
  const css: Record<string, string> = {}
  let dynamic = false
  for (const p of list(obj, 'properties')) {
    const k = child(p, 'key')
    const key =
      p.type === 'ObjectProperty' && !flag(p, 'computed') && k
        ? k.type === 'Identifier'
          ? str(k, 'name')
          : k.type === 'StringLiteral'
            ? str(k, 'value')
            : undefined
        : undefined
    const v = staticValue(child(p, 'value'))
    if (!key || v === undefined || typeof v === 'boolean') {
      dynamic = true
      continue
    }
    const value = typeof v === 'number' ? (UNITLESS.has(key) ? String(v) : `${v}px`) : v
    expandStyle(key, value, css)
  }
  const mapped = mapComputedStyle(styleGetterFrom(css))
  const unmapped = Object.fromEntries(Object.entries(css).filter(([n]) => !isMappedCssName(n)))
  return { mapped, unmapped, dynamic }
}

function tagName(n: AstNode | undefined, code: string): string {
  if (!n) return 'unknown'
  if (n.type === 'JSXIdentifier') return str(n, 'name') ?? 'unknown'
  if (n.type === 'JSXMemberExpression') {
    return `${tagName(child(n, 'object'), code)}.${str(child(n, 'property'), 'name') ?? ''}`
  }
  if (n.type === 'JSXNamespacedName') {
    return `${str(child(n, 'namespace'), 'name')}:${str(child(n, 'name'), 'name')}`
  }
  return snippet(code, n) || 'unknown'
}

const attrName = (n: AstNode | undefined): string => {
  if (n?.type === 'JSXNamespacedName') {
    return `${str(child(n, 'namespace'), 'name')}:${str(child(n, 'name'), 'name')}`
  }
  return str(n, 'name') ?? ''
}

function convertElement(el: AstNode, cx: Ctx, cond?: Cond): Item | null {
  if (cx.nodes.length >= cx.max) {
    cx.truncated = true
    return null
  }
  const opening = child(el, 'openingElement')
  const tag = tagName(child(opening, 'name'), cx.code)
  const content: PropGroup = {}
  const custom: PropGroup = { tag }
  const attrs: Record<string, string | number | boolean> = {}
  const bindings: Record<string, string> = {}
  const handlers: string[] = []
  let styleProps: MappedProps = {}

  if (!/^[a-z]/.test(tag)) {
    custom.componentUse = true
    cx.unknown.add(tag)
  }

  for (const a of list(opening, 'attributes')) {
    if (a.type === 'JSXSpreadAttribute') {
      bindings['...'] = snippet(cx.code, child(a, 'argument'))
      cx.dynamic++
      continue
    }
    const name = attrName(child(a, 'name'))
    if (!name || name === 'key' || name === 'ref') continue
    const v = child(a, 'value')
    let expr: AstNode | undefined
    let val: string | number | boolean | undefined
    if (!v) val = true
    else if (v.type === 'JSXExpressionContainer') {
      expr = child(v, 'expression')
      val = staticValue(expr)
    } else val = staticValue(v)

    if (name === 'style') {
      if (expr?.type === 'ObjectExpression') {
        const s = styleFrom(expr)
        styleProps = s.mapped
        const n = Object.keys(s.unmapped).length
        if (n > 0) {
          custom.unmappedStyle = s.unmapped
          cx.unmappedStyle += n
        }
        if (s.dynamic) {
          bindings.style = snippet(cx.code, expr)
          cx.dynamicStyle++
        }
      } else {
        bindings.style = snippet(cx.code, expr ?? v)
        cx.dynamicStyle++
      }
      continue
    }
    if (/^on[A-Z]/.test(name)) {
      handlers.push(name)
      continue
    }
    if (val === undefined) {
      bindings[name] = snippet(cx.code, expr ?? v)
      cx.dynamic++
      continue
    }
    switch (name) {
      case 'className':
      case 'class':
        custom.className = String(val)
        break
      case 'id':
        custom.id = String(val)
        break
      case 'role':
        custom.role = String(val)
        break
      case 'aria-label':
        custom.ariaLabel = String(val)
        break
      case 'src':
      case 'alt':
      case 'href':
      case 'placeholder':
      case 'value':
        content[name] = String(val)
        break
      case 'type':
        if (tag === 'input') content.inputType = String(val)
        else attrs.type = String(val)
        break
      default:
        attrs[name] = val
    }
  }

  if (Object.keys(attrs).length > 0) custom.attrs = attrs
  if (Object.keys(bindings).length > 0) custom.bindings = bindings
  if (handlers.length > 0) custom.handlers = handlers
  if (cond) custom.condition = cond.expr

  const id = typeof custom.id === 'string' ? custom.id : undefined
  const cls = typeof custom.className === 'string' ? custom.className.split(/\s+/)[0] : undefined
  const node = createNode({
    type: tag === 'img' ? 'image' : 'element',
    name: id ? `${tag}#${id}` : cls ? `${tag}.${cls}` : tag,
    ...(cond?.hidden ? { hidden: true } : {}),
    props: fullProps({ ...styleProps, content, custom }),
  })
  cx.nodes.push(node)
  fill(node, childItems(list(el, 'children'), cx), cx, true)
  return { kind: 'node', node }
}

function fill(node: Node, items: Item[], cx: Ctx, collapse: boolean) {
  const texts = items.filter((i): i is TextItem => i.kind === 'text')
  if (collapse && items.length > 0 && texts.length === items.length) {
    node.props.content.text = texts.map((t) => t.text).join(' ')
    const bs = texts.flatMap((t) => (t.binding ? [t.binding] : []))
    if (bs.length > 0) node.props.custom.textBinding = bs.join(', ')
    return
  }
  for (const it of items) {
    if (it.kind === 'node') {
      node.children.push(it.node.id)
      continue
    }
    const t = createNode({
      type: 'text',
      name: 'text',
      props: fullProps({
        content: { text: it.text },
        custom: it.binding ? { binding: it.binding } : {},
      }),
    })
    cx.nodes.push(t)
    node.children.push(t.id)
  }
}

function childItems(children: AstNode[], cx: Ctx, cond?: Cond): Item[] {
  return children.flatMap((c) => itemsFromChild(c, cx, cond))
}

function itemsFromChild(c: AstNode, cx: Ctx, cond?: Cond): Item[] {
  switch (c.type) {
    case 'JSXText': {
      const t = norm(str(c, 'value') ?? '')
      return t ? [{ kind: 'text', text: t }] : []
    }
    case 'JSXExpressionContainer':
      return itemsFromExpr(child(c, 'expression'), cx, cond)
    case 'JSXElement':
    case 'JSXFragment':
      return itemsFromExpr(c, cx, cond)
    default:
      return []
  }
}

function itemsFromExpr(e: AstNode | undefined, cx: Ctx, cond?: Cond): Item[] {
  if (!e || e.type === 'JSXEmptyExpression') return []
  switch (e.type) {
    case 'JSXElement': {
      const tag = tagName(child(child(e, 'openingElement'), 'name'), cx.code)
      if (tag === 'Fragment' || tag === 'React.Fragment') {
        return childItems(list(e, 'children'), cx, cond)
      }
      const it = convertElement(e, cx, cond)
      return it ? [it] : []
    }
    case 'JSXFragment':
      return childItems(list(e, 'children'), cx, cond)
    case 'ConditionalExpression': {
      const test = snippet(cx.code, child(e, 'test'))
      return [
        ...itemsFromExpr(child(e, 'consequent'), cx, { expr: test, hidden: false }),
        ...itemsFromExpr(child(e, 'alternate'), cx, { expr: `!(${test})`, hidden: true }),
      ]
    }
    case 'LogicalExpression':
      if (str(e, 'operator') === '&&') {
        return itemsFromExpr(child(e, 'right'), cx, {
          expr: snippet(cx.code, child(e, 'left')),
          hidden: false,
        })
      }
      break
    case 'NullLiteral':
    case 'BooleanLiteral':
      return []
    default: {
      const v = staticValue(e)
      if (v !== undefined) {
        const t = norm(String(v))
        return t ? [{ kind: 'text', text: t }] : []
      }
    }
  }
  // 動的な式: プレースホルダーとして保持
  const s = snippet(cx.code, e)
  cx.dynamic++
  if (/\.map\(/.test(s)) cx.lists++
  return [{ kind: 'text', text: `{${s}}`, binding: s }]
}

const RENDERABLE = new Set([
  'JSXElement',
  'JSXFragment',
  'ConditionalExpression',
  'LogicalExpression',
])

// 関数が返す JSX 式(トップレベルの最初の return)
export function returnedJsx(fn: AstNode): AstNode | undefined {
  const body = child(fn, 'body')
  if (!body) return undefined
  if (body.type !== 'BlockStatement') return RENDERABLE.has(body.type) ? body : undefined
  for (const st of list(body, 'body')) {
    if (st.type !== 'ReturnStatement') continue
    const a = child(st, 'argument')
    if (a && RENDERABLE.has(a.type)) return a
  }
  return undefined
}

// 規約: nodes[0] がルート
export function convertJsx(
  expr: AstNode,
  code: string,
  root: Node,
  maxNodes: number,
): { nodes: Node[]; warnings: string[] } {
  const cx: Ctx = {
    code,
    nodes: [root],
    max: maxNodes,
    truncated: false,
    dynamic: 0,
    lists: 0,
    unknown: new Set(),
    unmappedStyle: 0,
    dynamicStyle: 0,
  }
  fill(root, itemsFromExpr(expr, cx), cx, false)

  const warnings: string[] = []
  if (cx.unknown.size > 0) {
    warnings.push(
      `未解決のコンポーネント ${[...cx.unknown].map((t) => `<${t}>`).join(', ')} は汎用コンテナとして取り込み`,
    )
  }
  if (cx.dynamic > 0) {
    warnings.push(`動的な式 ${cx.dynamic} 件はプレースホルダー/custom.bindings として保持`)
  }
  if (cx.lists > 0) warnings.push(`.map による繰り返し ${cx.lists} 件は展開していません`)
  if (cx.unmappedStyle > 0) {
    warnings.push(`style の未対応プロパティ ${cx.unmappedStyle} 件は custom.unmappedStyle に保持`)
  }
  if (cx.dynamicStyle > 0) {
    warnings.push(`動的な style ${cx.dynamicStyle} 件は custom.bindings.style に保持`)
  }
  if (cx.truncated) warnings.push(`ノード数が上限(${maxNodes})を超えたため一部を取り込んでいません`)
  return { nodes: cx.nodes, warnings }
}
