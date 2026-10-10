import { describe, expect, it } from 'vitest'
import { createNode, type ImportResult, type Node } from '@/core'
import { logger } from '@/shared'
import { sha256Hex } from './hash'
import { fullProps } from './html/convert'
import { filesFromInputs, resolveResources } from './resources'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const img = (src: string): Node =>
  createNode({ type: 'image', name: 'img', props: fullProps({ content: { src } }) })
const box = (backgroundImage: string): Node =>
  createNode({ type: 'element', props: fullProps({ appearance: { backgroundImage } }) })
const result = (...nodes: Node[]): ImportResult => ({
  nodes: [createNode({ type: 'element', name: 'root' }), ...nodes],
  assets: [],
  tokens: {},
  warnings: [],
})
const bytes = (...n: number[]) => new Uint8Array(n).buffer as ArrayBuffer
const reply = (body: number[], type: string) =>
  new Response(new Uint8Array(body), { headers: { 'content-type': type } })

describe('sha256Hex', () => {
  it('既知のハッシュ値と一致する', async () => {
    const buf = new TextEncoder().encode('abc').buffer as ArrayBuffer
    expect(await sha256Hex(buf)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('resolveResources', () => {
  it('data: URI を Asset 化し、src を asset: に書き換える', async () => {
    const out = await resolveResources(result(img(PNG)))
    expect(out.result.assets).toHaveLength(1)
    const a = out.result.assets[0]
    expect(a).toMatchObject({ kind: 'image', mime: 'image/png', source: 'data-uri' })
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(a.name).toMatch(/^inline-[0-9a-f]{8}\.png$/)
    expect(out.result.nodes[1].props.content.src).toBe(`asset:${a.id}`)
    expect(out.assetData.get(a.id)?.data.byteLength).toBe(a.size)
    expect(a.size).toBeGreaterThan(0)
  })

  it('同じ内容は 1 つの Asset にまとめる', async () => {
    const out = await resolveResources(result(img(PNG), img(PNG), box(`url("${PNG}")`)))
    expect(out.result.assets).toHaveLength(1)
    const id = out.result.assets[0].id
    expect(out.result.nodes[1].props.content.src).toBe(`asset:${id}`)
    expect(out.result.nodes[3].props.appearance.backgroundImage).toBe(`url("asset:${id}")`)
  })

  it('ドロップされたファイルで相対参照を解決する(ネットワーク不使用)', async () => {
    const out = await resolveResources(result(img('images/b.png')), {
      files: [{ name: 'b.png', data: bytes(1, 2, 3) }],
      allowNetwork: false,
    })
    const a = out.result.assets[0]
    expect(a).toMatchObject({ name: 'b.png', mime: 'image/png', source: 'images/b.png', size: 3 })
    expect(out.result.nodes[1].props.content.src).toBe(`asset:${a.id}`)
  })

  it('http(s) と、baseUrl 基準の相対 URL を取得する', async () => {
    const calls: string[] = []
    const out = await resolveResources(result(img('https://example.com/x.png'), img('a.png')), {
      baseUrl: 'https://example.com/ui/page.html',
      fetchFn: async (u) => {
        calls.push(u)
        return reply([u.length], 'image/png')
      },
    })
    expect(calls.sort()).toEqual(['https://example.com/ui/a.png', 'https://example.com/x.png'])
    expect(out.result.assets).toHaveLength(2)
    expect(out.result.warnings).toEqual([])
  })

  it('取得失敗は元の参照を残し、unresolvedRefs と warnings に記録する', async () => {
    const out = await resolveResources(
      result(img('https://e.com/a.png'), img('https://e.com/b.png')),
      {
        fetchFn: async (u) => {
          if (u.endsWith('a.png')) throw new TypeError('Failed to fetch')
          return new Response('', { status: 404 })
        },
      },
    )
    expect(out.result.assets).toHaveLength(0)
    const a = out.result.nodes[1]
    expect(a.props.content.src).toBe('https://e.com/a.png')
    expect(a.props.custom.unresolvedRefs).toEqual(['https://e.com/a.png'])
    expect(out.result.warnings.some((w) => w.includes('2 件'))).toBe(true)
  })

  it('allowNetwork: false / 基準なしの相対 URL では fetch しない', async () => {
    let called = 0
    const fetchFn = async () => {
      called++
      return reply([1], 'image/png')
    }
    await resolveResources(result(img('https://e.com/a.png')), { allowNetwork: false, fetchFn })
    const out = await resolveResources(result(img('rel/a.png')), { fetchFn })
    expect(called).toBe(0)
    expect(out.result.warnings).toHaveLength(1)
  })

  it('maxBytes を超えるものは失敗扱い', async () => {
    const out = await resolveResources(result(img('https://e.com/big.png')), {
      maxBytes: 5,
      fetchFn: async () => reply([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'image/png'),
    })
    expect(out.result.assets).toHaveLength(0)
    expect(out.result.warnings).toHaveLength(1)
  })

  it('background-image の ua-ext: を asset: に置換し、他の値は残す', async () => {
    const ref = 'https://e.com/b.png'
    const out = await resolveResources(
      result(box(`linear-gradient(red, blue), url("ua-ext:${encodeURIComponent(ref)}")`)),
      { fetchFn: async () => reply([7], 'image/png') },
    )
    const v = String(out.result.nodes[1].props.appearance.backgroundImage)
    expect(v).toContain('linear-gradient(red, blue)')
    expect(v).toMatch(/url\("asset:[^"]+"\)/)
    expect(v).not.toContain('ua-ext')
    expect(out.result.assets[0].source).toBe(ref)
  })

  it('svg の mime は kind: svg になる', async () => {
    const out = await resolveResources(result(img('https://e.com/i.svg')), {
      fetchFn: async () => reply([60, 115], 'image/svg+xml; charset=utf-8'),
    })
    expect(out.result.assets[0]).toMatchObject({
      kind: 'svg',
      mime: 'image/svg+xml',
      name: 'i.svg',
    })
  })

  it('入力を変更しない / 参照が無ければそのまま返す', async () => {
    const input = result(img(PNG))
    const before = JSON.stringify(input)
    await resolveResources(input)
    expect(JSON.stringify(input)).toBe(before)
    const none = result(createNode({ type: 'element' }))
    expect((await resolveResources(none)).result).toBe(none)
  })

  it('実行ログに resources タスクが記録される', async () => {
    logger.clear()
    await resolveResources(result(img(PNG)))
    expect(logger.getEntries().some((e) => e.message.startsWith('resources:'))).toBe(true)
  })
})

describe('filesFromInputs', () => {
  it('file 入力だけを抽出する', () => {
    const files = filesFromInputs([
      { kind: 'file', name: 'a.png', mime: 'image/png', data: bytes(1) },
      { kind: 'text', text: 'x' },
      { kind: 'file', name: 'b.css', text: 'b{}' },
    ])
    expect(files).toEqual([{ name: 'a.png', mime: 'image/png', data: bytes(1) }])
  })
})
