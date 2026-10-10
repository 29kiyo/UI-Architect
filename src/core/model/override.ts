import { z } from 'zod'
import { IdSchema } from './ids'
import { PROP_GROUP_KEYS, PropGroupSchema } from './props'

// グループ単位で「上書きするキーだけ」を持つ
export const PropsDiffSchema = z.partialRecord(z.enum(PROP_GROUP_KEYS), PropGroupSchema)
export type PropsDiff = z.infer<typeof PropsDiffSchema>

export const NodeOverrideSchema = z.object({
  propsDiff: PropsDiffSchema.default({}),
  hidden: z.boolean().optional(), // 未指定なら共有値
  order: z.array(IdSchema).optional(), // このデバイスでの子の並び(未指定なら共有順)
  // true の間は共有 props に追従せず、propsDiff が実効値のすべてになる
  detached: z.boolean().default(false),
})
export type NodeOverride = z.infer<typeof NodeOverrideSchema>

// deviceId → nodeId → override
export const PageOverridesSchema = z
  .record(IdSchema, z.record(IdSchema, NodeOverrideSchema))
  .default({})
export type PageOverrides = z.infer<typeof PageOverridesSchema>

// コンポーネントのバリアント / インスタンスが「定義内のノード」に対して持つ上書き
export const InstanceOverrideSchema = NodeOverrideSchema.pick({ propsDiff: true, hidden: true })
export type InstanceOverride = z.infer<typeof InstanceOverrideSchema>
