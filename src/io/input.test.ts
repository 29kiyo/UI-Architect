import { describe, expect, it } from 'vitest'
import { logger } from '@/shared'
import { fromFile, fromFiles, fromText, fromUrl, ImportInputError, isTextLike } from './input'

const html = (body: string, type = 'text/html; charset=utf-8') =>
  new Response(body, { headers: { 'content-type': type } })

describe('isTextLike', () => {
  it('mime / 拡張子で判定する', () => {
    expect(isTextLike('a.bin', 'text/plain')).toBe(true)
    expect(isTextLike('a.svg', 'image/svg+xml')).toBe(true)
    expect(isTextLike('Button.tsx')).toBe(true)
    expect(isTextLike('a.png', 'image/png')).toBe(false)
    expect(isTextLike()).toBe(false)
  })
})

describe('fromText', () => {
  it('貼付テキストを ImportInput にする', () => {
    expect(fromText('<p>x</p>', 'paste.html')).toEqual({
      kind: 'text',
      text: '<p>x</p>',
      name: 'paste.html',
    })
    expect(fromText('x')).toEqual({ kind: 'text', text: 'x' })
  })
})

describe('fromFile / fromFiles', () => {
  it('テキスト系は text と data の両方を持つ', async () => {
    const r = await fromFile(new File(['<b>あ</b>'], 'a.html', { type: 'text/html' }))
    expect(r.kind).toBe('file')
    expect(r.name).toBe('a.html')
    expect(r.mime).toBe('text/html')
    expect(r.text).toBe('<b>あ</b>')
    expect(r.data?.byteLength).toBeGreaterThan(0)
  })

  it('バイナリは data のみ', async () => {
    const r = await fromFile(new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' }))
    expect(r.text).toBeUndefined()
    expect(r.data?.byteLength).toBe(3)
  })

  it('複数ファイルを順序どおり変換する', async () => {
    const rs = await fromFiles([new File(['1'], 'a.css'), new File(['2'], 'b.tsx')])
    expect(rs.map((r) => r.name)).toEqual(['a.css', 'b.tsx'])
    expect(rs.map((r) => r.text)).toEqual(['1', '2'])
  })
})

describe('fromUrl', () => {
  it('取得して name/mime/url/text を埋める', async () => {
    const r = await fromUrl('https://example.com/ui/card.html', {
      fetchFn: async () => html('<div></div>'),
    })
    expect(r).toMatchObject({
      kind: 'url',
      url: 'https://example.com/ui/card.html',
      name: 'card.html',
      mime: 'text/html; charset=utf-8',
      text: '<div></div>',
    })
  })

  it('不正URL・http(s)以外は invalid-url', async () => {
    await expect(fromUrl('not a url')).rejects.toMatchObject({ code: 'invalid-url' })
    await expect(fromUrl('file:///etc/passwd')).rejects.toBeInstanceOf(ImportInputError)
  })

  it('fetch 失敗は fetch-failed(貼付案内つき)', async () => {
    const err = await fromUrl('https://example.com/', {
      fetchFn: async () => {
        throw new TypeError('Failed to fetch')
      },
    }).catch((e: unknown) => e)
    expect(err).toMatchObject({ code: 'fetch-failed' })
    expect((err as Error).message).toContain('貼付')
  })

  it('HTTPエラーは http-error', async () => {
    await expect(
      fromUrl('https://example.com/', { fetchFn: async () => new Response('', { status: 404 }) }),
    ).rejects.toMatchObject({ code: 'http-error' })
  })

  it('サイズ超過は too-large', async () => {
    await expect(
      fromUrl('https://example.com/', { fetchFn: async () => html('0123456789'), maxBytes: 5 }),
    ).rejects.toMatchObject({ code: 'too-large' })
  })

  it('中断は元のエラーをそのまま投げる', async () => {
    const ac = new AbortController()
    ac.abort()
    const abort = new DOMException('aborted', 'AbortError')
    await expect(
      fromUrl('https://example.com/', {
        signal: ac.signal,
        fetchFn: async () => {
          throw abort
        },
      }),
    ).rejects.toBe(abort)
  })

  it('実行ログに fetch タスクが記録される', async () => {
    logger.clear()
    await fromUrl('https://example.com/a.css', { fetchFn: async () => html('a{}', 'text/css') })
    expect(logger.getEntries().some((e) => e.message.startsWith('fetch:'))).toBe(true)
  })
})
