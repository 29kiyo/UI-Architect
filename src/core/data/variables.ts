import type { Id, UIDocument, Variable } from '../model'
import type { Scope, Value } from '../expr'

const DEFAULTS: Record<Variable['type'], Value> = {
  string: '',
  number: 0,
  boolean: false,
  json: null,
}

// global → page → component の順に上書き(狭いスコープが優先)
export function getInitialValues(
  doc: UIDocument,
  ctx: { pageId?: Id; componentId?: Id } = {},
): Scope {
  const out: Scope = {}
  const apply = (vars: Variable[]) => {
    for (const v of vars) out[v.name] = (v.initial ?? DEFAULTS[v.type]) as Value
  }
  apply(doc.variables.filter((v) => v.scope === 'global'))
  if (ctx.pageId) apply(doc.variables.filter((v) => v.scope === 'page' && v.ownerId === ctx.pageId))
  if (ctx.componentId) {
    apply(doc.variables.filter((v) => v.scope === 'component' && v.ownerId === ctx.componentId))
  }
  return out
}

// 読込時の検証用(スキーマでは見ない重複・参照切れ)。問題の説明を返す。
export function findVariableIssues(doc: UIDocument): string[] {
  const issues: string[] = []
  const seen = new Set<string>()
  for (const v of doc.variables) {
    if (v.scope === 'global') {
      if (v.ownerId !== undefined) issues.push(`global variable has ownerId: ${v.name}`)
    } else if (v.ownerId === undefined) {
      issues.push(`${v.scope} variable needs ownerId: ${v.name}`)
    } else {
      const exists =
        v.scope === 'page'
          ? doc.pages.some((p) => p.id === v.ownerId)
          : doc.components.some((c) => c.id === v.ownerId)
      if (!exists) issues.push(`${v.scope} owner not found: ${v.name} -> ${v.ownerId}`)
    }
    const key = `${v.scope}/${v.ownerId ?? ''}/${v.name}`
    if (seen.has(key)) issues.push(`duplicate variable: ${v.name} (${v.scope})`)
    seen.add(key)
  }
  return issues
}
