import { describe, expect, it } from 'vitest'
import { createMasterFor } from '../master'
import { createEmptyDocument } from '../model'
import { findAssetUsages } from './usage'

describe('アセット使用箇所にマスターを含む', () => {
  it('マスター内の画像参照を検出する', () => {
    const doc = createEmptyDocument('t')
    const m = createMasterFor(doc)
    m.nodes[m.rootNodeId]!.props.content.src = 'asset:a1'
    doc.masters.push(m)
    const hits = findAssetUsages(doc).filter((u) => u.assetId === 'a1')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ area: 'node', pageId: m.id })
  })
})
