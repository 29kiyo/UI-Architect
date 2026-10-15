import { describe, expect, it } from 'vitest'
import {
  createDocumentStore,
  createEmptyDocument,
  createHistory,
  createNode,
  PROP_GROUP_KEYS,
  resolveNode,
} from '@/core'
import { createPropsCommand } from '../canvas/commands'
import { nodeStyle } from '../canvas/style'
import { registerBuiltinProps } from './builtin'
import { normalizeInput } from './commit'
import { applicableNodes, writesFor } from './multi'
import { createPropRegistry, type PropDef } from './registry'

const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
// 描画に使われないグループ
const NOT_RENDERED = new Set(['content', 'custom', 'states'])

// 定義ごとの有効な入力値(UI と同じ normalizeInput を通す)
function sampleValue(def: PropDef): string | number {
  let raw: string
  switch (def.type) {
    case 'select':
      raw = def.options![0]!.value
      break
    case 'color':
      raw = '#123456'
      break
    case 'number':
      raw = String(Math.min(def.max ?? 5, Math.max(def.min ?? 0, 0.5) + 0))
      break
    case 'length': {
      const u = def.units![0]!
      raw =
        /^[a-z]+$/.test(u) && !['px', '%', 'rem', 'em', 'vw', 'vh', 's', 'ms'].includes(u)
          ? u
          : `10${u}`
      break
    }
    default:
      raw = 'sample'
  }
  const v = normalizeInput(def, raw)
  if (v === undefined) throw new Error(`sample rejected: ${def.group}.${def.key} (${raw})`)
  return v
}

function setup(category = 'container') {
  const doc = createEmptyDocument('t')
  const page = doc.pages[0]!
  const a = createNode({ type: 'element', name: 'a', category })
  page.nodes[a.id] = a
  page.nodes[page.rootNodeId]!.children = [a.id]
  const store = createDocumentStore(doc)
  const history = createHistory(store)
  const cur = () => store.getState().doc.pages[0]!
  return {
    history,
    cur,
    pageId: page.id,
    a: a.id,
    pc: doc.devices[0]!.id,
    mobile: doc.devices[1]!.id,
  }
}

describe('Phase 6 completion: every registered prop', () => {
  const registry = createPropRegistry()
  registerBuiltinProps(registry)
  const defs = registry.all()

  it('registers props in valid groups only', () => {
    // 件数ではなく、主要グループがそれぞれ登録されていることを確認する
    for (const g of [
      'layout',
      'size',
      'position',
      'appearance',
      'border',
      'radius',
      'shadow',
      'effects',
      'transform',
      'typography',
      'content',
      'transition',
      'custom',
    ] as const)
      expect(registry.forGroup(g).length, g).toBeGreaterThan(0)
    for (const d of defs) expect(PROP_GROUP_KEYS).toContain(d.group)
  })

  it('edit → effective value → canvas style → undo, for every prop', () => {
    for (const def of defs) {
      const t = setup(def.appliesTo?.[0] ?? 'container')
      const value = sampleValue(def)
      const node0 = resolveNode(t.cur(), t.pc, t.a)!
      expect(applicableNodes([node0], def), `${def.group}.${def.key} applies`).toHaveLength(1)
      t.history.execute(
        createPropsCommand({
          name: 'edit',
          pageId: t.pageId,
          deviceId: t.pc,
          base: true,
          writes: writesFor([node0], def, value),
        }),
      )
      const node = resolveNode(t.cur(), t.pc, t.a)!
      expect(node.props[def.group][def.key], `${def.group}.${def.key} value`).toBe(value)
      if (!NOT_RENDERED.has(def.group)) {
        const style = nodeStyle(node) as Record<string, unknown>
        expect(style[camel(def.cssMapping ?? def.key)], `${def.group}.${def.key} style`).toBe(value)
      }
      t.history.undo()
      expect(
        resolveNode(t.cur(), t.pc, t.a)!.props[def.group][def.key],
        `${def.group}.${def.key} undo`,
      ).toBeUndefined()
    }
  })

  it('device-overridable props write an override on another device and keep shared untouched', () => {
    for (const def of defs.filter((d) => d.deviceOverridable)) {
      const t = setup(def.appliesTo?.[0] ?? 'container')
      const value = sampleValue(def)
      t.history.execute(
        createPropsCommand({
          name: 'edit',
          pageId: t.pageId,
          deviceId: t.mobile,
          base: false,
          writes: writesFor([resolveNode(t.cur(), t.mobile, t.a)!], def, value),
        }),
      )
      expect(t.cur().nodes[t.a]!.props[def.group][def.key], def.key).toBeUndefined()
      expect(resolveNode(t.cur(), t.mobile, t.a)!.props[def.group][def.key], def.key).toBe(value)
    }
  })
})

describe('Phase 6 completion: adding a prop is a registry entry only', () => {
  it('a new def appears in listings, applies by category, writes and renders without other changes', () => {
    const registry = createPropRegistry()
    registerBuiltinProps(registry)
    const before = registry.all().length
    const extra: PropDef = {
      key: 'textIndent',
      group: 'typography',
      label: { ja: 'インデント', en: 'Indent' },
      type: 'length',
      units: ['px', 'em'],
      appliesTo: ['text-body'],
      deviceOverridable: true,
    }
    registry.register(extra)
    expect(registry.all()).toHaveLength(before + 1)
    expect(registry.forGroup('typography').map((d) => d.key)).toContain('textIndent')
    expect(registry.forCategory('text-body', 'typography').map((d) => d.key)).toContain(
      'textIndent',
    )
    expect(registry.forCategory('button', 'typography').map((d) => d.key)).not.toContain(
      'textIndent',
    )

    const t = setup('text-body')
    const value = sampleValue(extra)
    t.history.execute(
      createPropsCommand({
        name: 'edit',
        pageId: t.pageId,
        deviceId: t.pc,
        base: true,
        writes: writesFor([resolveNode(t.cur(), t.pc, t.a)!], extra, value),
      }),
    )
    const node = resolveNode(t.cur(), t.pc, t.a)!
    expect((nodeStyle(node) as Record<string, unknown>).textIndent).toBe(value)
    t.history.undo()
    expect(resolveNode(t.cur(), t.pc, t.a)!.props.typography.textIndent).toBeUndefined()
  })
})
