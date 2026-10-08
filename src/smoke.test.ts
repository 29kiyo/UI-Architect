import { describe, expect, it } from 'vitest'
import App from '@/App'

describe('smoke', () => {
  it('@/ エイリアスが解決できる', () => {
    expect(typeof App).toBe('function')
  })
})
