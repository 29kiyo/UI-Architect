import { afterEach, describe, expect, it } from 'vitest'
import {
  createRegistry,
  emitterRegistry,
  importerRegistry,
  providerRegistry,
  registerEmitter,
  registerImporter,
  registerProvider,
  type Emitter,
  type Importer,
  type Provider,
} from './index'

const importer: Importer = {
  id: 'html',
  label: 'HTML',
  detect: (i) => (i.text?.includes('<') ? 1 : 0),
  parse: async () => ({ nodes: [], assets: [], tokens: {}, warnings: [] }),
}
const emitter: Emitter = {
  id: 'html-css',
  label: 'HTML/CSS',
  ext: 'html',
  emit: async () => [{ path: 'index.html', content: '' }],
}
const provider: Provider = {
  id: 'mock',
  label: 'Mock',
  listModels: async () => [{ id: 'm1' }],
  async *chat() {
    yield 'ok'
  },
}

afterEach(() => {
  importerRegistry.unregister('html')
  emitterRegistry.unregister('html-css')
  providerRegistry.unregister('mock')
})

describe('registry', () => {
  it('register / get / list / unregister、重複 ID は throw', () => {
    const r = createRegistry<{ id: string }>('thing')
    r.register({ id: 'a' })
    r.register({ id: 'b' })
    expect(() => r.register({ id: 'a' })).toThrow(/already registered: a/)
    expect(r.get('a')).toEqual({ id: 'a' })
    expect(r.get('x')).toBeUndefined()
    expect(r.list().map((x) => x.id)).toEqual(['a', 'b'])
    expect(r.unregister('a')).toBe(true)
    expect(r.unregister('a')).toBe(false)
    expect(r.list()).toHaveLength(1)
  })

  it('registerImporter / Emitter / Provider が型どおり動く', async () => {
    registerImporter(importer)
    registerEmitter(emitter)
    registerProvider(provider)
    expect(importerRegistry.get('html')?.detect({ kind: 'text', text: '<p>' })).toBe(1)
    expect(await emitterRegistry.get('html-css')?.emit({}, {})).toHaveLength(1)
    const chunks: string[] = []
    for await (const c of providerRegistry.get('mock')!.chat([])) chunks.push(c)
    expect(chunks).toEqual(['ok'])
    expect(() => registerImporter(importer)).toThrow()
  })
})
