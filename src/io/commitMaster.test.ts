import { describe, expect, it } from 'vitest'
import { createMasterFor, createEmptyDocument, createNode, type ImportResult } from '@/core'
import { createImportCommand } from './commit'

describe('マスターへの取り込み', () => {
  it('pageId にマスター ID を渡すとマスターに入る', () => {
    const doc = createEmptyDocument('t')
    const m = createMasterFor(doc)
    doc.masters.push(m)
    const node = createNode({ type: 'element', name: 'Header' })
    const result = {
      nodes: [node],
      assets: [],
      tokens: {},
      warnings: [],
    } as unknown as ImportResult
    createImportCommand(result, { pageId: m.id }).apply(doc)
    expect(doc.masters[0]!.nodes[node.id]).toBeDefined()
    expect(doc.masters[0]!.nodes[m.rootNodeId]!.children).toContain(node.id)
    expect(doc.pages[0]!.nodes[node.id]).toBeUndefined()
  })
})
