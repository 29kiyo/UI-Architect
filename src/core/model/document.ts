import { z } from 'zod'
import { IdSchema } from './ids'
import { NodeSchema, type Node } from './node'
import { ComponentDefSchema } from './component'
import { MockCollectionSchema, VariableSchema } from './variable'
import { PageOverridesSchema, type PageOverrides } from './override'

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
const pageShape = {
  id: IdSchema,
  name: z.string(),
  route: z.string(),
  rootNodeId: IdSchema,
  nodes: z.record(IdSchema, NodeSchema),
  overrides: PageOverridesSchema,
}

type PageLike = { rootNodeId: string; nodes: Record<string, Node>; overrides: PageOverrides }
type IssueCtx = { addIssue: (issue: { code: 'custom'; message: string }) => void }

function checkPage(page: PageLike, ctx: IssueCtx): void {
  if (!page.nodes[page.rootNodeId]) {
    ctx.addIssue({ code: 'custom', message: `rootNodeId not found: ${page.rootNodeId}` })
  }
  for (const byNode of Object.values(page.overrides)) {
    for (const nodeId of Object.keys(byNode)) {
      if (!page.nodes[nodeId]) {
        ctx.addIssue({ code: 'custom', message: `override target not found: ${nodeId}` })
      }
    }
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
}

export const PageSchema = z
  .object({
    ...pageShape,
    // 隠すマスターの ID(未指定ならすべてのマスターを表示)
    hiddenMasterIds: z.array(IdSchema).optional(),
  })
  .superRefine((page, ctx) => checkPage(page, ctx))
export type Page = z.infer<typeof PageSchema>

// マスター(共通部品): 全ページに自動で出る。ページ別に hiddenMasterIds で隠す。
// Page と同じ形にして、既存の編集機能(キャンバス/レイヤー/インスペクタ)を流用する
export const MasterPositionSchema = z.enum(['top', 'bottom', 'overlay'])
export type MasterPosition = z.infer<typeof MasterPositionSchema>
export const MasterSchema = z
  .object({
    ...pageShape,
    route: z.string().default(''),
    position: MasterPositionSchema.default('top'),
  })
  .superRefine((m, ctx) => checkPage(m, ctx))
export type Master = z.infer<typeof MasterSchema>

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

export const UIDocumentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  project: z.object({
    name: z.string(),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
    homePageId: IdSchema.optional(),
  }),
  devices: z.array(DeviceSchema).default([]),
  pages: z.array(PageSchema).default([]),
  masters: z.array(MasterSchema).default([]),
  assets: z.array(AssetSchema).default([]),
  tokens: TokensSchema.default({ colors: {}, spacing: {}, fonts: {} }),
  variables: z.array(VariableSchema).default([]),
  components: z.array(ComponentDefSchema).default([]),
  mockData: z.array(MockCollectionSchema).default([]),
})
export type UIDocument = z.infer<typeof UIDocumentSchema>
