import { z } from 'zod'
import { IdSchema } from './ids'
import { NodeSchema } from './node'
import { InstanceOverrideSchema } from './override'

export const ComponentVariantSchema = z.object({
  id: IdSchema,
  name: z.string(),
  overrides: z.record(IdSchema, InstanceOverrideSchema).default({}),
})
export type ComponentVariant = z.infer<typeof ComponentVariantSchema>

// nodeId: 定義内でスロットになるノード(インスタンスの子がここに入る)
export const ComponentSlotSchema = z.object({ id: IdSchema, name: z.string(), nodeId: IdSchema })
export type ComponentSlot = z.infer<typeof ComponentSlotSchema>

export const ComponentDefSchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    rootNodeId: IdSchema,
    nodes: z.record(IdSchema, NodeSchema),
    variants: z.array(ComponentVariantSchema).default([]),
    slots: z.array(ComponentSlotSchema).default([]),
  })
  .superRefine((def, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (!def.nodes[def.rootNodeId]) issue(`rootNodeId not found: ${def.rootNodeId}`)
    for (const [key, node] of Object.entries(def.nodes)) {
      if (key !== node.id) issue(`node key/id mismatch: ${key} / ${node.id}`)
      for (const c of node.children) if (!def.nodes[c]) issue(`child not found: ${node.id} -> ${c}`)
    }
    for (const s of def.slots) if (!def.nodes[s.nodeId]) issue(`slot node not found: ${s.nodeId}`)
    for (const v of def.variants) {
      for (const t of Object.keys(v.overrides)) {
        if (!def.nodes[t]) issue(`variant override target not found: ${v.id} -> ${t}`)
      }
    }
  })
export type ComponentDef = z.infer<typeof ComponentDefSchema>
