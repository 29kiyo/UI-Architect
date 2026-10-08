import { describe, expect, it } from 'vitest'
import { createLogger } from './logger'

describe('logger', () => {
  it('リングバッファ: 上限を超えると古いものから消える', () => {
    const l = createLogger({ capacity: 3 })
    for (let i = 1; i <= 5; i++) l.info(`m${i}`)
    expect(l.getEntries().map((e) => e.message)).toEqual(['m3', 'm4', 'm5'])
  })

  it('logLevel 未満は記録しない', () => {
    const l = createLogger()
    l.setLevel('warn')
    l.debug('d')
    l.info('i')
    l.warn('w')
    l.error('e')
    expect(l.getEntries().map((e) => e.message)).toEqual(['w', 'e'])
  })

  it('task: 開始→終了で所要時間が記録される', () => {
    let t = 1000
    const l = createLogger({ now: () => t })
    const task = l.startTask('save')
    expect(l.getEntries()[0].status).toBe('running')
    t = 1250
    task.done()
    const e = l.getEntries()[0]
    expect(e.status).toBe('done')
    expect(e.durationMs).toBe(250)
  })

  it('runTask: 失敗も記録され、例外は再送出される', async () => {
    const l = createLogger()
    await expect(
      l.runTask('import', () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    const e = l.getEntries()[0]
    expect(e.status).toBe('error')
    expect(e.message).toContain('boom')
  })

  it('task は logLevel が高くても記録される', () => {
    const l = createLogger()
    l.setLevel('error')
    l.startTask('export').done()
    expect(l.getEntries()).toHaveLength(1)
  })

  it('変更が購読者に通知される', () => {
    const l = createLogger()
    let count = 0
    const off = l.subscribe(() => count++)
    l.info('a')
    off()
    l.info('b')
    expect(count).toBe(1)
  })
})
