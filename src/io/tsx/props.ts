import { child, flag, list, snippet, str, type AstNode } from './ast'

export type PropInfo = Record<string, string | boolean>
export type Cx = { decls: Map<string, AstNode>; code: string; warnings: Set<string> }

const WRAPPERS = new Set(['PropsWithChildren', 'React.PropsWithChildren', 'Readonly'])
const FC = new Set([
  'FC',
  'React.FC',
  'FunctionComponent',
  'React.FunctionComponent',
  'VFC',
  'React.VFC',
])

export function refName(n?: AstNode): string | undefined {
  if (!n) return undefined
  if (n.type === 'Identifier') return str(n, 'name')
  if (n.type === 'TSQualifiedName') {
    const l = refName(child(n, 'left'))
    const r = str(child(n, 'right'), 'name')
    return l && r ? `${l}.${r}` : undefined
  }
  return undefined
}

const typeArgs = (t: AstNode | undefined): AstNode[] =>
  list(child(t, 'typeArguments') ?? child(t, 'typeParameters'), 'params')

function keyName(m: AstNode): string | undefined {
  const k = child(m, 'key')
  if (!k) return undefined
  if (k.type === 'Identifier') return str(k, 'name')
  if (k.type === 'StringLiteral') return str(k, 'value')
  return undefined
}

function docOf(n: AstNode): string | undefined {
  const comments = n['leadingComments']
  if (!Array.isArray(comments) || comments.length === 0) return undefined
  const last = comments[comments.length - 1] as { value?: unknown }
  if (typeof last.value !== 'string') return undefined
  const text = last.value
    .replace(/^\*+/, '')
    .replace(/^\s*\*\s?/gm, '')
    .trim()
  return text || undefined
}

export function indexTypes(program: AstNode): Map<string, AstNode> {
  const decls = new Map<string, AstNode>()
  for (const st of list(program, 'body')) {
    const d = child(st, 'declaration') ?? st
    if (d.type === 'TSInterfaceDeclaration' || d.type === 'TSTypeAliasDeclaration') {
      const name = str(child(d, 'id'), 'name')
      if (name) decls.set(name, d)
    }
  }
  return decls
}

function membersOf(members: AstNode[], cx: Cx): PropInfo[] {
  const out: PropInfo[] = []
  for (const m of members) {
    const name = keyName(m)
    if (!name) continue
    let type: string
    if (m.type === 'TSPropertySignature') {
      type = snippet(cx.code, child(child(m, 'typeAnnotation'), 'typeAnnotation')) || 'unknown'
    } else if (m.type === 'TSMethodSignature') {
      type = 'function'
    } else {
      continue
    }
    const info: PropInfo = { name, type, optional: flag(m, 'optional') }
    const doc = docOf(m)
    if (doc) info.description = doc
    out.push(info)
  }
  return out
}

function resolveDecl(d: AstNode, cx: Cx, depth: number): PropInfo[] {
  if (d.type === 'TSTypeAliasDeclaration') return resolveType(child(d, 'typeAnnotation'), cx, depth)
  const base = list(d, 'extends').flatMap((h) => {
    const name = refName(child(h, 'expression'))
    const decl = name ? cx.decls.get(name) : undefined
    if (decl) return resolveDecl(decl, cx, depth + 1)
    cx.warnings.add(`外部型 ${name ?? '(不明)'} の props は展開していません`)
    return []
  })
  return [...base, ...membersOf(list(child(d, 'body'), 'body'), cx)]
}

export function resolveType(t: AstNode | undefined, cx: Cx, depth = 0): PropInfo[] {
  if (!t || depth > 8) return []
  switch (t.type) {
    case 'TSTypeLiteral':
      return membersOf(list(t, 'members'), cx)
    case 'TSIntersectionType':
      return list(t, 'types').flatMap((x) => resolveType(x, cx, depth + 1))
    case 'TSTypeReference': {
      const name = refName(child(t, 'typeName'))
      const args = typeArgs(t)
      if (name && WRAPPERS.has(name) && args[0]) return resolveType(args[0], cx, depth + 1)
      const decl = name ? cx.decls.get(name) : undefined
      if (decl) return resolveDecl(decl, cx, depth + 1)
      cx.warnings.add(`外部型 ${name ?? '(不明)'} の props は展開していません`)
      return []
    }
    default:
      return []
  }
}

export type Candidate = {
  name: string
  params: AstNode[]
  exported: 'default' | 'named' | 'no'
  fn?: AstNode
  fcType?: AstNode
}

const fnFrom = (e: AstNode | undefined): AstNode | undefined => {
  if (!e) return undefined
  if (e.type === 'ArrowFunctionExpression' || e.type === 'FunctionExpression') return e
  if (e.type === 'CallExpression') {
    for (const a of list(e, 'arguments')) {
      const f = fnFrom(a)
      if (f) return f
    }
  }
  return undefined
}

export function collectCandidates(program: AstNode): Candidate[] {
  const out: Candidate[] = []
  let defaultName: string | undefined

  const add = (decl: AstNode, exported: Candidate['exported']) => {
    if (decl.type === 'FunctionDeclaration' || decl.type === 'TSDeclareFunction') {
      const name = str(child(decl, 'id'), 'name')
      if (name && /^[A-Z]/.test(name)) {
        out.push({
          name,
          params: list(decl, 'params'),
          exported,
          ...(decl.type === 'FunctionDeclaration' ? { fn: decl } : {}),
        })
      }
    } else if (decl.type === 'VariableDeclaration') {
      for (const v of list(decl, 'declarations')) {
        const id = child(v, 'id')
        const name = str(id, 'name')
        if (!name || !/^[A-Z]/.test(name)) continue
        const fn = fnFrom(child(v, 'init'))
        const ann = child(child(id, 'typeAnnotation'), 'typeAnnotation')
        const fcType =
          ann?.type === 'TSTypeReference' && FC.has(refName(child(ann, 'typeName')) ?? '')
            ? ann
            : undefined
        if (fn || fcType) {
          out.push({
            name,
            params: fn ? list(fn, 'params') : [],
            exported,
            ...(fn ? { fn } : {}),
            ...(fcType ? { fcType } : {}),
          })
        }
      }
    }
  }

  for (const st of list(program, 'body')) {
    if (st.type === 'ExportDefaultDeclaration') {
      const d = child(st, 'declaration')
      if (d?.type === 'Identifier') defaultName = str(d, 'name')
      else if (d) add(d, 'default')
    } else if (st.type === 'ExportNamedDeclaration') {
      const d = child(st, 'declaration')
      if (d) add(d, 'named')
    } else {
      add(st, 'no')
    }
  }

  const RANK = { default: 0, named: 1, no: 2 }
  return out
    .map((c) => (c.name === defaultName ? { ...c, exported: 'default' as const } : c))
    .sort((a, b) => RANK[a.exported] - RANK[b.exported])
}

export function propsOf(c: Candidate, cx: Cx): PropInfo[] {
  const p0 = c.params[0]
  const ann = child(child(p0, 'typeAnnotation'), 'typeAnnotation')
  const props = ann ? resolveType(ann, cx) : c.fcType ? resolveType(typeArgs(c.fcType)[0], cx) : []

  // 分割代入の既定値
  if (p0?.type === 'ObjectPattern') {
    for (const prop of list(p0, 'properties')) {
      if (prop.type !== 'ObjectProperty') continue
      const value = child(prop, 'value')
      if (value?.type !== 'AssignmentPattern') continue
      const name = keyName(prop)
      const def = snippet(cx.code, child(value, 'right'))
      const target = props.find((p) => p.name === name)
      if (target && def) target.defaultValue = def
    }
  }

  // 同名は後勝ち(継承元より派生側を優先)
  return [...new Map(props.map((p) => [String(p.name), p])).values()]
}
