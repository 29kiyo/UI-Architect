import { describe, expect, it } from 'vitest'
import { createEmptyDocument } from '../model'
import { createMasterFor, splitMasters } from './ops'

describe('splitMasters', () => {
  it('位置別に分け、隠したものと編集中マスターは除く', () => {
    const doc = createEmptyDocument('t')
    const a = createMasterFor(doc, 'top')
    const b = createMasterFor(doc, 'bottom')
    const c = createMasterFor(doc, 'overlay')
    doc.masters.push(a, b, c)
    const page = doc.pages[0]!
    let s = splitMasters(doc, page)
    expect(s.top.map((m) => m.id)).toEqual([a.id])
    expect(s.bottom.map((m) => m.id)).toEqual([b.id])
    expect(s.overlay.map((m) => m.id)).toEqual([c.id])
    page.hiddenMasterIds = [b.id]
    s = splitMasters(doc, page)
    expect(s.bottom).toEqual([])
    s = splitMasters(doc, a)
    expect(s).toEqual({ top: [], bottom: [], overlay: [] })
  })
})
