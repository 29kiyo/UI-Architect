import { describe, expect, it } from 'vitest'
import { createEmptyDocument, type Asset } from '../model'
import { assetRows } from './panel'

const a = (id: string, o: Partial<Asset> = {}): Asset => ({
  id,
  kind: 'image',
  name: `${id}.png`,
  mime: 'image/png',
  hash: `h-${id}`,
  size: 1,
  ...o,
})

describe('assetRows', () => {
  const doc = createEmptyDocument('t')
  doc.assets = [a('Cat'), a('dog'), a('f', { kind: 'font', name: 'F.woff2' })]
  const page = doc.pages[0]
  page.nodes[page.rootNodeId].props.content.src = 'asset:Cat'

  it('使用数・未使用を出す', () => {
    const rows = assetRows(doc)
    expect(rows.find((r) => r.asset.id === 'Cat')).toMatchObject({ usageCount: 1, unused: false })
    expect(rows.find((r) => r.asset.id === 'dog')?.unused).toBe(true)
  })
  it('検索・種類・未使用で絞る', () => {
    expect(assetRows(doc, { query: 'CAT' }).map((r) => r.asset.id)).toEqual(['Cat'])
    expect(assetRows(doc, { kind: 'font' }).map((r) => r.asset.id)).toEqual(['f'])
    expect(assetRows(doc, { unusedOnly: true }).map((r) => r.asset.id)).toEqual(['dog', 'f'])
  })
})
