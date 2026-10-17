import { describe, expect, it } from 'vitest'
import { createEmptyDocument, createNode } from '../model'
import { componentizeBlocker, componentsForPage } from './commands'
import { createComponentDef, createInstanceNode } from './ops'
import { resolveInstance, resolveInstanceIn } from './resolve'

describe('componentizeBlocker', () => {
  it('ルート・存在しない・インスタンスを含む場合は理由を返す', () => {
    const doc = createEmptyDocument('t')
    const page = doc.pages[0]!
    const n = createNode({ type: 'element', name: 'a' })
    page.nodes[n.id] = n
    page.nodes[page.rootNodeId]!.children.push(n.id)
    expect(componentizeBlocker(page, page.rootNodeId)).toBe('root')
    expect(componentizeBlocker(page, 'x')).toBe('missing')
    expect(componentizeBlocker(page, n.id)).toBeNull()
    n.componentRef = { componentId: 'c', overrides: {}, slotContent: {} }
    expect(componentizeBlocker(page, n.id)).toBe('instance')
  })
})

describe('componentsForPage', () => {
  it('他ページ専用の定義は含まない', () => {
    const doc = createEmptyDocument('t')
    const a = createComponentDef('A')
    const b = { ...createComponentDef('B'), scope: 'page' as const, ownerId: 'p1' }
    const c = { ...createComponentDef('C'), scope: 'page' as const, ownerId: 'p2' }
    doc.components.push(a, b, c)
    expect(componentsForPage(doc, 'p1').map((x) => x.name)).toEqual(['A', 'B'])
  })
})

describe('resolveInstanceIn', () => {
  it('resolveInstance と同じ結果', () => {
    const doc = createEmptyDocument('t')
    const def = createComponentDef('A')
    doc.components.push(def)
    const inst = createInstanceNode(def.id)
    expect(resolveInstanceIn(doc.components, inst)).toEqual(resolveInstance(doc, inst))
    expect(resolveInstanceIn([], inst)).toBeUndefined()
  })
})
