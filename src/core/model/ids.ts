import { z } from 'zod'

export const IdSchema = z.string().min(1)
export type Id = z.infer<typeof IdSchema>

export function newId(): Id {
  return crypto.randomUUID()
}
