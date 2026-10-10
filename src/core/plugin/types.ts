import type { Asset, Node, Tokens } from '../model'

// ---- Importer(実装は Phase 3)----
export type ImportInput = {
  kind: 'text' | 'file' | 'url'
  name?: string
  mime?: string
  text?: string
  data?: ArrayBuffer
  url?: string
}
export type ImportContext = { deviceId?: string; signal?: AbortSignal }
export type ImportResult = {
  nodes: Node[]
  assets: Asset[]
  tokens: Partial<Tokens>
  warnings: string[]
}
export type Importer = {
  id: string
  label: string
  detect(input: ImportInput): number // 0〜1。最高スコアを採用
  parse(input: ImportInput, ctx: ImportContext): Promise<ImportResult>
}

// ---- Emitter(実装は Phase 10。IR の型は Phase 10 で定義)----
export type EmitFile = { path: string; content: string }
export type Emitter = {
  id: string
  label: string
  ext: string
  emit(ir: unknown, options: Record<string, unknown>): Promise<EmitFile[]>
}

// ---- Provider(実装は Phase 11)----
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type ModelInfo = { id: string; label?: string }
export type ChatOptions = { model?: string; signal?: AbortSignal }
export type Provider = {
  id: string
  label: string
  listModels(): Promise<ModelInfo[]>
  chat(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string>
}
