import { z } from 'zod'
import { IdSchema } from './ids'

// 式の中で参照できる識別子
export const VariableNameSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)

export const VariableSchema = z.object({
  id: IdSchema,
  name: VariableNameSchema,
  scope: z.enum(['global', 'page', 'component']).default('global'),
  // scope が page / component のとき、pageId / componentId
  ownerId: IdSchema.optional(),
  type: z.enum(['string', 'number', 'boolean', 'json']).default('string'),
  initial: z.json().optional(),
})
export type Variable = z.infer<typeof VariableSchema>

export const MockFieldRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('index'), start: z.number().int().default(1) }),
  z.object({ kind: z.literal('pick'), values: z.array(z.json()).min(1) }), // 行順に循環
  z.object({
    kind: z.literal('range'),
    min: z.number(),
    max: z.number(),
    integer: z.boolean().default(true),
  }),
  z.object({ kind: z.literal('template'), template: z.string() }), // {i} → 行番号(1 始まり)
])
export type MockFieldRule = z.infer<typeof MockFieldRuleSchema>

export const MockRuleSchema = z.object({
  count: z.number().int().min(0).max(10000),
  seed: z.number().int().default(1),
  fields: z.record(z.string(), MockFieldRuleSchema),
})
export type MockRule = z.infer<typeof MockRuleSchema>

// rule があれば rule から生成、無ければ rows(手入力)を使う
export const MockCollectionSchema = z.object({
  id: IdSchema,
  name: z.string(),
  rows: z.array(z.record(z.string(), z.json())).default([]),
  rule: MockRuleSchema.optional(),
})
export type MockCollection = z.infer<typeof MockCollectionSchema>
