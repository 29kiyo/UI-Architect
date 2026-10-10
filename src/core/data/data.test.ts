import { describe, expect, it } from 'vitest'
import { createLogger } from '@/shared'
import {
  MockCollectionSchema,
  MockRuleSchema,
  UIDocumentSchema,
  VariableSchema,
  createEmptyDocument,
  type MockCollection,
  type Variable,
} from '../model'
import { createHistory } from '../history'
import { createDocumentStore } from '../store'
import { evaluate } from '../expr'
import {
  addVariable,
  findVariableIssues,
  generateMockRows,
  getInitialValues,
  removeMockCollection,
  removeVariable,
  resolveMockRows,
  upsertMockCollection,
} from './index'

const mkVar = (p: { id: string; name: string } & Partial<Variable>): Variable =>
  VariableSchema.parse(p)

describe('variables', () => {
  it('名前は識別子形式のみ', () => {
    expect(VariableSchema.safeParse({ id: 'v', name: '1a' }).success).toBe(false)
    expect(VariableSchema.safeParse({ id: 'v', name: 'a-b' }).success).toBe(false)
    expect(VariableSchema.safeParse({ id: 'v', name: 'ok_1' }).success).toBe(true)
  })

  it('初期値: 型ごとの既定値と、global → page → component の上書き', () => {
    const base = createEmptyDocument('t')
    const pageId = base.pages[0].id
    const doc = {
      ...base,
      variables: [
        mkVar({ id: '1', name: 'title', initial: 'G' }),
        mkVar({ id: '2', name: 'count', type: 'number' }),
        mkVar({ id: '3', name: 'title', scope: 'page', ownerId: pageId, initial: 'P' }),
        mkVar({ id: '4', name: 'title', scope: 'component', ownerId: 'c1', initial: 'C' }),
        mkVar({ id: '5', name: 'other', scope: 'page', ownerId: 'other-page', initial: 'x' }),
      ],
    }
    expect(getInitialValues(doc)).toEqual({ title: 'G', count: 0 })
    expect(getInitialValues(doc, { pageId })).toEqual({ title: 'P', count: 0 })
    expect(getInitialValues(doc, { pageId, componentId: 'c1' }).title).toBe('C')
  })

  it('初期値を式のスコープに渡せる', () => {
    const doc = {
      ...createEmptyDocument('t'),
      variables: [mkVar({ id: '1', name: 'count', type: 'number', initial: 3 })],
    }
    expect(evaluate("count > 0 ? 'many' : 'none'", getInitialValues(doc))).toBe('many')
  })

  it('整合性: ownerId の欠落・参照切れ・重複', () => {
    const base = createEmptyDocument('t')
    const ok = {
      ...base,
      variables: [mkVar({ id: '1', name: 'a', scope: 'page', ownerId: base.pages[0].id })],
    }
    expect(findVariableIssues(ok)).toEqual([])
    const bad = {
      ...base,
      variables: [
        mkVar({ id: '1', name: 'a', scope: 'page' }),
        mkVar({ id: '2', name: 'b', scope: 'component', ownerId: 'nope' }),
        mkVar({ id: '3', name: 'c', ownerId: 'x' }),
        mkVar({ id: '4', name: 'd' }),
        mkVar({ id: '5', name: 'd' }),
      ],
    }
    expect(findVariableIssues(bad)).toHaveLength(4)
  })
})

describe('mock data', () => {
  const rule = MockRuleSchema.parse({
    count: 5,
    fields: {
      id: { kind: 'index' },
      name: { kind: 'template', template: 'User {i}' },
      role: { kind: 'pick', values: ['a', 'b'] },
      age: { kind: 'range', min: 20, max: 30 },
    },
  })

  it('index / template / pick / range(整数・範囲内)', () => {
    const rows = generateMockRows(rule)
    expect(rows).toHaveLength(5)
    expect(rows[0].id).toBe(1)
    expect(rows[4].id).toBe(5)
    expect(rows[2].name).toBe('User 3')
    expect(rows.map((r) => r.role)).toEqual(['a', 'b', 'a', 'b', 'a'])
    for (const r of rows) {
      const age = r.age as number
      expect(Number.isInteger(age) && age >= 20 && age <= 30).toBe(true)
    }
  })

  it('同じ seed なら同じ結果、違えば変わる', () => {
    const big = { ...rule, count: 30 }
    expect(generateMockRows(big)).toEqual(generateMockRows(big))
    expect(generateMockRows({ ...big, seed: 2 })).not.toEqual(generateMockRows(big))
  })

  it('小数 range / count 0 / 手入力 rows', () => {
    const f = generateMockRows({
      count: 3,
      seed: 1,
      fields: { x: { kind: 'range', min: 0, max: 1, integer: false } },
    })
    for (const r of f) expect((r.x as number) >= 0 && (r.x as number) < 1).toBe(true)
    expect(generateMockRows({ ...rule, count: 0 })).toEqual([])
    const manual = MockCollectionSchema.parse({ id: 'm', name: 'm', rows: [{ a: 1 }] })
    expect(resolveMockRows(manual)).toEqual([{ a: 1 }])
  })

  it('スキーマ: count 上限・pick の空配列を拒否', () => {
    expect(MockRuleSchema.safeParse({ count: 10001, fields: {} }).success).toBe(false)
    expect(
      MockRuleSchema.safeParse({ count: 1, fields: { a: { kind: 'pick', values: [] } } }).success,
    ).toBe(false)
  })
})

describe('ops / 永続化 / 履歴', () => {
  it('追加・削除・重複拒否・Undo / Redo・JSON 往復', () => {
    const doc = createEmptyDocument('t')
    const store = createDocumentStore(doc)
    const history = createHistory(store, { logger: createLogger() })
    const coll: MockCollection = MockCollectionSchema.parse({ id: 'm', name: 'users', rule })
    history.execute({
      name: 'add data',
      apply: (d) => {
        addVariable(d, mkVar({ id: 'v1', name: 'count', type: 'number', initial: 1 }))
        upsertMockCollection(d, coll)
      },
    })
    const after = store.getState().doc
    expect(after.variables).toHaveLength(1)
    expect(after.mockData).toHaveLength(1)
    expect(UIDocumentSchema.parse(JSON.parse(JSON.stringify(after)))).toEqual(after)

    expect(() =>
      history.execute({
        name: 'dup',
        apply: (d) => addVariable(d, mkVar({ id: 'v2', name: 'count' })),
      }),
    ).toThrow()
    expect(() => history.execute({ name: 'rm', apply: (d) => removeVariable(d, 'nope') })).toThrow()
    expect(() =>
      history.execute({ name: 'rm', apply: (d) => removeMockCollection(d, 'nope') }),
    ).toThrow()

    history.undo()
    expect(store.getState().doc).toEqual(doc)
    history.redo()
    expect(store.getState().doc).toEqual(after)
  })
})

const rule = MockRuleSchema.parse({ count: 3, fields: { id: { kind: 'index' } } })
