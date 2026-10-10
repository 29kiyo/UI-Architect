import { z } from 'zod'
import { IdSchema } from './ids'
import { PropsSchema } from './props'
import { InstanceOverrideSchema } from './override'

// アクションの詳細は Phase 9 で拡張する。判別キーは type。
export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('toggle'), variable: z.string() }),
  z.object({ type: z.literal('setVariable'), variable: z.string(), expr: z.string() }),
  z.object({
    type: z.literal('navigate'),
    pageId: IdSchema,
    mode: z.enum(['push', 'replace', 'back']).default('push'),
  }),
  z.object({ type: z.literal('showHide'), nodeId: IdSchema, visible: z.boolean().optional() }),
  z.object({ type: z.literal('callAI'), promptId: z.string().optional() }),
  z.object({
    type: z.literal('custom'),
    name: z.string(),
    params: z.record(z.string(), z.json()).default({}),
  }),
])
export type Action = z.infer<typeof ActionSchema>

export const EventSchema = z.object({
  id: IdSchema,
  trigger: z.string(), // click / change / ... (Phase 9 で列挙)
  condition: z.string().optional(), // 安全な独自式 (Phase 2-F / 9-C)
  actions: z.array(ActionSchema).default([]),
})
export type UIEvent = z.infer<typeof EventSchema>

// コンポーネントのインスタンス参照 (詳細は 2-E)
export const ComponentRefSchema = z.object({
  componentId: IdSchema,
  variantId: IdSchema.optional(),
  overrides: z.record(IdSchema, InstanceOverrideSchema).default({}),
  // slotId → インスタンスノードの children のうち、そのスロットに入れる子
  slotContent: z.record(IdSchema, z.array(IdSchema)).default({}),
})
export type ComponentRef = z.infer<typeof ComponentRefSchema>

export const NodeSchema = z.object({
  id: IdSchema,
  type: z.string().min(1), // 'element' | 'text' | 'image' ... 取り込み元の種別
  category: z.string().min(1), // Phase 4 のカテゴリ。未分類は 'container'
  name: z.string(),
  props: PropsSchema,
  children: z.array(IdSchema).default([]),
  events: z.array(EventSchema).default([]),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  componentRef: ComponentRefSchema.optional(),
})
export type Node = z.infer<typeof NodeSchema>
