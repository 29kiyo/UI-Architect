import { describe, expect, it } from 'vitest'
import { PROP_GROUP_KEYS } from '@/core'
import { BUILTIN_PROPS, registerBuiltinProps } from './builtin'
import { createPropRegistry } from './registry'

const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

describe('builtin prop defs', () => {
  it('has unique group.key and valid groups', () => {
    const ids = BUILTIN_PROPS.map((d) => `${d.group}.${d.key}`)
    expect(new Set(ids).size).toBe(ids.length)
    for (const d of BUILTIN_PROPS) expect(PROP_GROUP_KEYS).toContain(d.group)
  })

  it('uses camelCase keys (no hyphens)', () => {
    for (const d of BUILTIN_PROPS) expect(d.key).not.toContain('-')
  })

  it('has options for select and units for length', () => {
    for (const d of BUILTIN_PROPS) {
      if (d.type === 'select') expect(d.options?.length ?? 0).toBeGreaterThan(0)
      if (d.type === 'length') expect(d.units?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('maps css-rendered keys to a kebab-case css name', () => {
    for (const d of BUILTIN_PROPS) {
      if (d.group === 'content' || d.group === 'custom') continue
      expect(kebab(d.cssMapping ?? kebab(d.key))).toMatch(/^[a-z]+(-[a-z]+)*$/)
    }
  })

  it('covers the keys the importer and canvas rely on', () => {
    const r = createPropRegistry()
    registerBuiltinProps(r)
    const need: [string, string][] = [
      ['layout', 'display'],
      ['layout', 'flexDirection'],
      ['layout', 'columnGap'],
      ['layout', 'marginTop'],
      ['layout', 'paddingLeft'],
      ['size', 'width'],
      ['size', 'maxWidth'],
      ['position', 'position'],
      ['position', 'top'],
      ['position', 'zIndex'],
      ['transform', 'transform'],
      ['typography', 'fontSize'],
      ['appearance', 'backgroundColor'],
      ['radius', 'borderTopLeftRadius'],
      ['border', 'borderTopWidth'],
      ['shadow', 'boxShadow'],
    ]
    for (const [g, k] of need) expect(r.get(g as never, k), `${g}.${k}`).toBeDefined()
  })

  it('limits content props by category', () => {
    const r = createPropRegistry()
    registerBuiltinProps(r)
    const keys = (c: string) => r.forCategory(c, 'content').map((d) => d.key)
    expect(keys('image')).toContain('src')
    expect(keys('button')).not.toContain('src')
    expect(keys('link')).toContain('href')
  })

  it('is idempotent', () => {
    const r = createPropRegistry()
    registerBuiltinProps(r)
    const n = r.all().length
    registerBuiltinProps(r)
    expect(r.all()).toHaveLength(n)
  })
})
