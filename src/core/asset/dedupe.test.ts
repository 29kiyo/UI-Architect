import { describe, expect, it } from 'vitest'
import type { Asset } from '../model'
import { dedupeAssets } from './dedupe'

const asset = (id: string, hash: string): Asset => ({
  id,
  kind: 'image',
  name: id,
  mime: 'image/png',
  hash,
  size: 1,
})

describe('dedupeAssets', () => {
  it('既存と同じ hash は既存 id へ寄せ、取り込み内の重複も 1 つにする', () => {
    const existing = [asset('e1', 'h1')]
    const incoming = [asset('i1', 'h1'), asset('i2', 'h2'), asset('i3', 'h2'), asset('e1', 'h1')]
    const { toAdd, remap } = dedupeAssets(existing, incoming)
    expect(toAdd.map((a) => a.id)).toEqual(['i2'])
    expect([...remap]).toEqual([
      ['i1', 'e1'],
      ['i3', 'i2'],
    ])
  })
  it('入力を変更しない', () => {
    const existing = [asset('e1', 'h1')]
    dedupeAssets(existing, [asset('i1', 'h2')])
    expect(existing).toHaveLength(1)
  })
})
