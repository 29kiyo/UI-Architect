import { z } from 'zod'
import { IdSchema } from './ids'
import { NodeSchema } from './node'

export const CURRENT_SCHEMA_VERSION = 1

export const DeviceSchema = z.object({
  id: IdSchema,
  name: z.string(),
  kind: z.enum(['pc', 'tablet', 'mobile']),
  width: z.number().positive(),
  height: z.number().positive(),
  pixelRatio: z.number().positive().default(1),
  safeArea: z
    .object({
      top: z.number().default(0),
      right: z.number().default(0),
      bottom: z.number().default(0),
      left: z.number().default(0),
    })
    .default({ top: 0, right: 0, bottom: 0, left: 0 }),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
})
export type Device = z.infer<typeof DeviceSchema>

// 正規化フラット + children は ID 配列。整合性(参照切れ)はここで検証する。
export const PageSchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    route: z.string(),
    rootNodeId: IdSchema,
    nodes: z.record(IdSchema, NodeSchema),
  })
  .superRefine((page, ctx) => {
    if (!page.nodes[page.rootNodeId]) {
      ctx.addIssue({ code: 'custom', message: `rootNodeId not found: ${page.rootNodeId}` })
    }
    for (const [key, node] of Object.entries(page.nodes)) {
      if (key !== node.id) {
        ctx.addIssue({ code: 'custom', message: `node key/id mismatch: ${key} / ${node.id}` })
      }
      for (const childId of node.children) {
        if (!page.nodes[childId]) {
          ctx.addIssue({ code: 'custom', message: `child not found: ${node.id} -> ${childId}` })
        }
      }
    }
  })
export type Page = z.infer<typeof PageSchema>

// Phase 7 で詳細化
export const AssetSchema = z.object({
  id: IdSchema,
  kind: z.enum(['image', 'svg', 'font', 'video', 'audio', 'other']),
  name: z.string(),
  mime: z.string(),
  hash: z.string(),
  size: z.number().nonnegative(),
  width: z.number().optional(),
  height: z.number().optional(),
  source: z.string().optional(),
})
export type Asset = z.infer<typeof AssetSchema>

export const TokensSchema = z.object({
  colors: z.record(z.string(), z.string()).default({}),
  spacing: z.record(z.string(), z.string()).default({}),
  fonts: z.record(z.string(), z.string()).default({}),
})
export type Tokens = z.infer<typeof TokensSchema>

// 2-F で詳細化
export const VariableSchema = z.object({
  id: IdSchema,
  name: z.string(),
  scope: z.enum(['global', 'page', 'component']).default('global'),
  type: z.enum(['string', 'number', 'boolean', 'json']).default('string'),
  initial: z.json().optional(),
})
export type Variable = z.infer<typeof VariableSchema>

// 2-E で詳細化
export const ComponentDefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  rootNodeId: IdSchema,
  nodes: z.record(IdSchema, NodeSchema),
  variants: z.array(z.object({ id: IdSchema, name: z.string() })).default([]),
  slots: z.array(z.object({ id: IdSchema, name: z.string() })).default([]),
})
export type ComponentDef = z.infer<typeof ComponentDefSchema>

// 2-F で詳細化
export const MockCollectionSchema = z.object({
  id: IdSchema,
  name: z.string(),
  rows: z.array(z.record(z.string(), z.json())).default([]),
  rule: z.string().optional(),
})
export type MockCollection = z.infer<typeof MockCollectionSchema>

export const UIDocumentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  project: z.object({
    name: z.string(),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
  }),
  devices: z.array(DeviceSchema).default([]),
  pages: z.array(PageSchema).default([]),
  assets: z.array(AssetSchema).default([]),
  tokens: TokensSchema.default({ colors: {}, spacing: {}, fonts: {} }),
  variables: z.array(VariableSchema).default([]),
  components: z.array(ComponentDefSchema).default([]),
  mockData: z.array(MockCollectionSchema).default([]),
})
export type UIDocument = z.infer<typeof UIDocumentSchema>
