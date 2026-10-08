import { z } from 'zod'

export const SETTINGS_VERSION = 1

// .catch(既定値): 欠損・不正値は既定値に補完。未知キーは z.object が捨てる
export const SettingsSchema = z.object({
  version: z.number().catch(SETTINGS_VERSION),
  showRunningCommands: z.boolean().catch(false),
  theme: z.enum(['light', 'dark', 'system']).catch('system'),
  language: z.enum(['ja', 'en']).catch('ja'),
  autosaveIntervalSec: z.number().int().min(5).max(3600).catch(30),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).catch('info'),
})

export type Settings = z.infer<typeof SettingsSchema>

export function parseSettings(raw: unknown): Settings {
  const obj = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}
  return { ...SettingsSchema.parse(obj), version: SETTINGS_VERSION }
}

export const DEFAULT_SETTINGS: Settings = parseSettings({})
