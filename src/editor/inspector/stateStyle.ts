import {
  getOverride,
  requireNode,
  resolveNode,
  setOverrideProp,
  type Command,
  type Id,
  type Node,
  type Page,
  type Props,
} from '@/core'
import { findPage } from '../canvas/commands'

// 取り込みと同じ形式: props.states[状態][camelCase キー] = 値
export const STATE_NAMES = ['hover', 'active', 'focus', 'disabled', 'checked'] as const
export type StateName = (typeof STATE_NAMES)[number]
export type StateValue = string | number

// 状態で編集できる項目 [レジストリのグループ, キー]
export const STATE_PROPS: [keyof Props, string][] = [
  ['appearance', 'backgroundColor'],
  ['typography', 'color'],
  ['appearance', 'opacity'],
  ['transform', 'transform'],
  ['shadow', 'boxShadow'],
  ['appearance', 'cursor'],
]

function plain(v: unknown): Record<string, StateValue> {
  const out: Record<string, StateValue> = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const [k, x] of Object.entries(v)) {
    if (typeof x === 'string' || typeof x === 'number') out[k] = x
  }
  return out
}

export const stateStyleOf = (
  node: Pick<Node, 'props'>,
  state: string,
): Record<string, StateValue> => plain(node.props.states[state])

export type StateWrite = { nodeId: Id; key: string; value: StateValue | undefined } // undefined は削除

// 基準デバイスは共有、他は overrides(状態オブジェクトごと置換)。createPropsCommand と同じ流儀
function writeState(page: Page, deviceId: Id, base: boolean, state: string, w: StateWrite): void {
  const node = requireNode(page, w.nodeId)
  const o = getOverride(page, deviceId, w.nodeId)
  const toOverride = !base || o?.detached || o?.propsDiff.states?.[state] !== undefined
  const next = { ...plain(resolveNode(page, deviceId, w.nodeId)?.props.states[state]) }
  if (w.value === undefined) delete next[w.key]
  else next[w.key] = w.value
  if (toOverride) setOverrideProp(page, deviceId, w.nodeId, 'states', state, next)
  else if (Object.keys(next).length === 0) delete node.props.states[state]
  else node.props.states[state] = next
}

type Options = {
  pageId: Id
  deviceId: Id
  base: boolean
  state: string
  writes: StateWrite[]
  coalesceKey?: string | undefined
}

export function createStateStyleCommand(o: Options): Command {
  return {
    name: `state style: ${o.state}`,
    ...(o.coalesceKey ? { coalesceKey: o.coalesceKey } : {}),
    apply: (draft) => {
      const page = findPage(draft.pages, o.pageId)
      for (const w of o.writes) writeState(page, o.deviceId, o.base, o.state, w)
    },
  }
}
