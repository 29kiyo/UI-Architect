import type { MockCollection, MockRule } from '../model'

// シード付き乱数(同じ seed なら同じ列)
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateMockRows(rule: MockRule): Record<string, unknown>[] {
  const rng = mulberry32(rule.seed)
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < rule.count; i++) {
    const row: Record<string, unknown> = {}
    for (const [field, r] of Object.entries(rule.fields)) {
      switch (r.kind) {
        case 'index':
          row[field] = r.start + i
          break
        case 'pick':
          row[field] = r.values[i % r.values.length]
          break
        case 'range':
          row[field] = r.integer
            ? Math.floor(r.min + rng() * (r.max - r.min + 1))
            : r.min + rng() * (r.max - r.min)
          break
        case 'template':
          row[field] = r.template.replaceAll('{i}', String(i + 1))
          break
      }
    }
    rows.push(row)
  }
  return rows
}

export function resolveMockRows(c: MockCollection): Record<string, unknown>[] {
  return c.rule ? generateMockRows(c.rule) : c.rows
}
