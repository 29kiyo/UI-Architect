import { beforeEach, describe, expect, it } from 'vitest'
import { createNode, createPage, PropsSchema, type Page } from '@/core'
import { clearClipboard } from './actions'
import { buildPaletteCommands, filterCommands, type PaletteCommand } from './commandList'

const cmd = (id: string, label: string): PaletteCommand => ({
  id,
  label,
  enabled: true,
  run: () => {},
})

describe('filterCommands', () => {
  const list = [
    cmd('edit:undo', '元に戻す'),
    cmd('align:left', '左揃え'),
    cmd('edit:delete', 'Delete'),
  ]
  it('空なら全部、語はすべて含むものだけ(大文字小文字無視、ID も対象)', () => {
    expect(filterCommands(list, '')).toHaveLength(3)
    expect(filterCommands(list, '揃え').map((c) => c.id)).toEqual(['align:left'])
    expect(filterCommands(list, 'EDIT del').map((c) => c.id)).toEqual(['edit:delete'])
    expect(filterCommands(list, 'zzz')).toEqual([])
  })
})

function mk() {
  const page: Page = createPage()
  const root = page.nodes[page.rootNodeId]!
  const add = () => {
    const n = createNode({
      type: 'element',
      props: PropsSchema.parse({ position: { position: 'absolute' } }),
    })
    page.nodes[n.id] = n
    root.children.push(n.id)
    return n.id
  }
  return { page, add }
}

describe('buildPaletteCommands の有効/無効', () => {
  beforeEach(clearClipboard)
  const base = { el: null, vp: { zoom: 1, panX: 0, panY: 0 }, language: 'ja' as const }
  const en = (cs: PaletteCommand[], id: string) => cs.find((c) => c.id === id)?.enabled

  it('選択なしでは編集・整列は無効、Undo は履歴次第', () => {
    const t = mk()
    const env = { doc: { devices: [{ id: 'pc' }] } as never, page: t.page, history: {} as never }
    const cs = buildPaletteCommands({
      ...base,
      env,
      selectedIds: [],
      deviceId: 'pc',
      canUndo: true,
      canRedo: false,
    })
    expect(en(cs, 'edit:undo')).toBe(true)
    expect(en(cs, 'edit:redo')).toBe(false)
    expect(en(cs, 'edit:delete')).toBe(false)
    expect(en(cs, 'edit:paste')).toBe(false)
    expect(en(cs, 'align:left')).toBe(false)
  })

  it('2 つ選択で整列・グループ化が有効、等間隔は 3 つから', () => {
    const t = mk()
    const [a, b, c] = [t.add(), t.add(), t.add()]
    const env = { doc: { devices: [{ id: 'pc' }] } as never, page: t.page, history: {} as never }
    const two = buildPaletteCommands({
      ...base,
      env,
      selectedIds: [a, b],
      deviceId: 'pc',
      canUndo: false,
      canRedo: false,
    })
    expect(en(two, 'align:left')).toBe(true)
    expect(en(two, 'edit:group')).toBe(true)
    expect(en(two, 'edit:ungroup')).toBe(false)
    expect(en(two, 'align:distribute-h')).toBe(false)
    expect(en(two, 'auto-layout')).toBe(true)
    const three = buildPaletteCommands({
      ...base,
      env,
      selectedIds: [a, b, c],
      deviceId: 'pc',
      canUndo: false,
      canRedo: false,
    })
    expect(en(three, 'align:distribute-h')).toBe(true)
  })

  it('言語でラベルが変わり、ショートカット表示を持つ', () => {
    const cs = buildPaletteCommands({
      ...base,
      language: 'en',
      env: undefined,
      selectedIds: [],
      deviceId: undefined,
      canUndo: false,
      canRedo: false,
    })
    const dup = cs.find((c) => c.id === 'edit:duplicate')!
    expect(dup.label).toBe('Duplicate')
    expect(dup.keys).toBe('Ctrl+D')
    expect(dup.enabled).toBe(false)
  })
})
