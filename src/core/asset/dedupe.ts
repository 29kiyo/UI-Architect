import type { Asset } from '../model'

// 既存と同じ hash の Asset は既存の id へ寄せる(取り込み内の重複も同様)
// toAdd: 新規に追加すべき Asset / remap: 寄せ先が変わった id(旧 → 新)
export function dedupeAssets(
  existing: readonly Asset[],
  incoming: readonly Asset[],
): { toAdd: Asset[]; remap: Map<string, string> } {
  const known = new Map<string, string>(existing.map((a) => [a.hash, a.id]))
  const toAdd: Asset[] = []
  const remap = new Map<string, string>()
  for (const a of incoming) {
    const found = known.get(a.hash)
    if (found) {
      if (found !== a.id) remap.set(a.id, found)
      continue
    }
    toAdd.push(a)
    known.set(a.hash, a.id)
  }
  return { toAdd, remap }
}
