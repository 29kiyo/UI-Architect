import { z } from 'zod'

// 各グループの中身は Phase 6 のプロパティ定義レジストリで確定する。
// ここでは「キー→JSON値」で受け、プロパティ追加時にスキーマ変更を要しないようにする。
export const PropGroupSchema = z.record(z.string(), z.json())
export type PropGroup = z.infer<typeof PropGroupSchema>

const group = () => PropGroupSchema.default({})

export const PropsSchema = z.object({
  layout: group(),
  size: group(),
  position: group(),
  appearance: group(),
  border: group(),
  radius: group(),
  shadow: group(),
  effects: group(),
  transform: group(),
  typography: group(),
  content: group(),
  states: group(),
  transition: group(),
  custom: group(),
})
export type Props = z.infer<typeof PropsSchema>

export const PROP_GROUP_KEYS = Object.keys(PropsSchema.shape) as (keyof Props)[]
