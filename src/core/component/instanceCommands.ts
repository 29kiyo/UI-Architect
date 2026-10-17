import type { Command } from '../history'
import type { ComponentDef, Id, PropGroup, Props } from '../model'
import { resetInstanceOverride, setInstanceHidden, setInstanceOverride } from './ops'

type Target = { pageId: Id; instanceId: Id }

export const createSetInstanceOverrideCommand = (
  o: Target & {
    targetId: Id
    group: keyof Props
    key: string
    value: PropGroup[string]
    coalesceKey?: string | undefined
  },
): Command => ({
  name: 'instance override',
  ...(o.coalesceKey ? { coalesceKey: o.coalesceKey } : {}),
  apply: (d) => setInstanceOverride(d, o.pageId, o.instanceId, o.targetId, o.group, o.key, o.value),
})

// 引数を絞るほど範囲が狭い: 全部 / targetId のノード / +group / +key
export const createResetInstanceOverrideCommand = (
  o: Target & {
    targetId?: Id | undefined
    group?: keyof Props | undefined
    key?: string | undefined
  },
): Command => ({
  name: 'reset instance override',
  apply: (d) => resetInstanceOverride(d, o.pageId, o.instanceId, o.targetId, o.group, o.key),
})

export const createSetInstanceHiddenCommand = (
  o: Target & { targetId: Id; hidden: boolean | undefined },
): Command => ({
  name: 'instance hidden',
  apply: (d) => setInstanceHidden(d, o.pageId, o.instanceId, o.targetId, o.hidden),
})

// 定義内ノードを木の順(深さ優先)に並べる。選択肢の表示用
export function defNodeOrder(
  def: Pick<ComponentDef, 'rootNodeId' | 'nodes'>,
): { id: Id; depth: number }[] {
  const out: { id: Id; depth: number }[] = []
  const seen = new Set<Id>()
  const visit = (id: Id, depth: number) => {
    const n = def.nodes[id]
    if (!n || seen.has(id)) return
    seen.add(id)
    out.push({ id, depth })
    for (const c of n.children) visit(c, depth + 1)
  }
  visit(def.rootNodeId, 0)
  return out
}
