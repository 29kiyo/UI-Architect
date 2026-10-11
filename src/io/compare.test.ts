import { describe, expect, it } from 'vitest'
import { wrapHtml } from './compare'

describe('wrapHtml', () => {
  it('CSP(外部通信禁止)つきの文書に本文を包む', () => {
    const html = wrapHtml('<p>hi</p>')
    expect(html).toContain("default-src 'none'")
    expect(html).toContain('<p>hi</p>')
  })
})
