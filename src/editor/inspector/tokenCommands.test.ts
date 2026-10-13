import { describe, expect, it } from 'vitest'
import { createDocumentStore, createEmptyDocument, createHistory } from '@/core'
import { createRemoveTokenCommand, createSetTokenCommand } from './tokenCommands'

describe('token commands', () => {
  it('sets, updates, removes and undoes', () => {
    const store = createDocumentStore(createEmptyDocument('t'))
    const h = createHistory(store)
    const tokens = () => store.getState().doc.tokens
    h.execute(createSetTokenCommand('colors', 'primary', '#f00'))
    expect(tokens().colors.primary).toBe('#f00')
    h.execute(createSetTokenCommand('colors', ' primary ', '#0f0'))
    expect(tokens().colors.primary).toBe('#0f0')
    h.execute(createRemoveTokenCommand('colors', 'primary'))
    expect(tokens().colors.primary).toBeUndefined()
    h.undo()
    expect(tokens().colors.primary).toBe('#0f0')
  })
  it('rejects an empty name', () => {
    const store = createDocumentStore(createEmptyDocument('t'))
    const h = createHistory(store)
    expect(() => h.execute(createSetTokenCommand('colors', '  ', '#f00'))).toThrow()
  })
})
