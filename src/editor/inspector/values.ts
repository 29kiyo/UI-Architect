// インスペクタの入力コントロールが使う、値の解析と組み立て(UI 非依存の純ロジック)
// 解析できない値は undefined を返す。呼び出し側はテキスト入力にフォールバックする。

const NUM = '-?(?:\\d+\\.?\\d*|\\.\\d+)'

export const fmtNum = (x: number): string => String(Math.round(x * 1e4) / 1e4)

// カッコの外側だけで分割する(rgba(0, 0, 0, .5) などを壊さない)
export function splitTop(s: string, sep: ',' | ' '): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    const isSep = depth === 0 && (sep === ',' ? ch === ',' : /\s/.test(ch))
    if (isSep) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim()).filter((x) => x.length > 0)
}

// ---- length ----
export type LengthValue = { value: number; unit: string } | { keyword: string }

const LEN_RE = new RegExp(`^(${NUM})([a-z%]*)$`, 'i')
const KW_RE = /^[a-z][a-z-]*$/i

// 数値は px 扱い(React の style と同じ)。単位なしの文字列は unit '' のまま保持する
export function parseLength(v: unknown): LengthValue | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? { value: v, unit: 'px' } : undefined
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  const m = LEN_RE.exec(s)
  if (m) return { value: parseFloat(m[1]!), unit: m[2]!.toLowerCase() }
  if (KW_RE.test(s)) return { keyword: s.toLowerCase() }
  return undefined
}

export function formatLength(v: LengthValue): string {
  return 'keyword' in v ? v.keyword : `${fmtNum(v.value)}${v.unit}`
}

// ---- shadow ----
export type Shadow = {
  inset: boolean
  x: number
  y: number
  blur: number
  spread: number
  color: string
}
export type ShadowKind = 'box' | 'text'

const PX_RE = new RegExp(`^(${NUM})(?:px)?$`, 'i')

export function parseShadows(v: unknown, kind: ShadowKind = 'box'): Shadow[] | undefined {
  if (v === undefined) return []
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (s === '' || s.toLowerCase() === 'none') return []
  const out: Shadow[] = []
  for (const part of splitTop(s, ',')) {
    let inset = false
    let color = ''
    const nums: number[] = []
    for (const t of splitTop(part, ' ')) {
      if (t.toLowerCase() === 'inset') {
        if (kind === 'text') return undefined
        inset = true
        continue
      }
      const m = PX_RE.exec(t)
      if (m) {
        nums.push(parseFloat(m[1]!))
        continue
      }
      if (color) return undefined
      color = t
    }
    if (nums.length < 2 || nums.length > (kind === 'box' ? 4 : 3)) return undefined
    out.push({ inset, x: nums[0]!, y: nums[1]!, blur: nums[2] ?? 0, spread: nums[3] ?? 0, color })
  }
  return out
}

export function formatShadows(list: Shadow[], kind: ShadowKind = 'box'): string {
  if (list.length === 0) return 'none'
  return list
    .map((s) =>
      [
        kind === 'box' && s.inset ? 'inset' : '',
        `${fmtNum(s.x)}px`,
        `${fmtNum(s.y)}px`,
        `${fmtNum(s.blur)}px`,
        kind === 'box' && s.spread !== 0 ? `${fmtNum(s.spread)}px` : '',
        s.color,
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join(', ')
}

// ---- linear-gradient ----
export type GradientStop = { color: string; pos?: number } // pos は %
export type LinearGradient = { angle: number; stops: GradientStop[] }

const DIRECTIONS: Record<string, number> = {
  'to top': 0,
  'to right': 90,
  'to bottom': 180,
  'to left': 270,
}
const ANGLE_RE = new RegExp(`^(${NUM})deg$`, 'i')
const STOP_RE = new RegExp(`^(.*\\S)\\s+(${NUM})%$`)

export function parseLinearGradient(v: unknown): LinearGradient | undefined {
  if (typeof v !== 'string') return undefined
  const m = /^linear-gradient\((.*)\)$/is.exec(v.trim())
  if (!m) return undefined
  const parts = splitTop(m[1]!, ',')
  let angle = 180 // CSS の既定は to bottom
  const first = parts[0]?.toLowerCase().replace(/\s+/g, ' ')
  const am = first ? ANGLE_RE.exec(first) : null
  if (am) {
    angle = parseFloat(am[1]!)
    parts.shift()
  } else if (first && DIRECTIONS[first] !== undefined) {
    angle = DIRECTIONS[first]!
    parts.shift()
  }
  if (parts.length < 2) return undefined
  const stops: GradientStop[] = []
  for (const p of parts) {
    const sm = STOP_RE.exec(p)
    const color = sm ? sm[1]! : p
    if (splitTop(color, ' ').length !== 1) return undefined // 位置2つ指定などは未対応
    stops.push(sm ? { color, pos: parseFloat(sm[2]!) } : { color })
  }
  return { angle, stops }
}

export function formatLinearGradient(g: LinearGradient): string {
  const stops = g.stops.map((s) => (s.pos === undefined ? s.color : `${s.color} ${fmtNum(s.pos)}%`))
  return `linear-gradient(${fmtNum(g.angle)}deg, ${stops.join(', ')})`
}

// ---- transform ----
export type TransformParts = {
  translateX: number // px
  translateY: number // px
  rotate: number // deg
  scaleX: number
  scaleY: number
  skewX: number // deg
  skewY: number // deg
}

export const IDENTITY_TRANSFORM: TransformParts = {
  translateX: 0,
  translateY: 0,
  rotate: 0,
  scaleX: 1,
  scaleY: 1,
  skewX: 0,
  skewY: 0,
}

const FN_RE = /([a-zA-Z]+)\(([^)]*)\)/g
// 合成順(これ以外の順で書かれた文字列は意味が変わるので分解しない)
const RANK: Record<string, number> = {
  translate: 0,
  translatex: 0,
  translatey: 0,
  rotate: 1,
  scale: 2,
  scalex: 2,
  scaley: 2,
  skew: 3,
  skewx: 3,
  skewy: 3,
}

function arg(a: string | undefined, unit: string): number | undefined {
  if (a === undefined) return undefined
  const m = new RegExp(`^(${NUM})(${unit})?$`, 'i').exec(a.trim())
  if (!m) return undefined
  const n = parseFloat(m[1]!)
  if (unit && !m[2] && n !== 0) return undefined // 単位なしは 0 のみ有効
  return n
}

export function parseTransform(v: unknown): TransformParts | undefined {
  if (v === undefined) return { ...IDENTITY_TRANSFORM }
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (s === '' || s.toLowerCase() === 'none') return { ...IDENTITY_TRANSFORM }
  if (s.replace(FN_RE, '').trim() !== '') return undefined
  const out = { ...IDENTITY_TRANSFORM }
  const seen = new Set<string>()
  let lastRank = -1
  const take = (key: string): boolean => {
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }
  for (const m of s.matchAll(FN_RE)) {
    const name = m[1]!.toLowerCase()
    const rank = RANK[name]
    if (rank === undefined || rank < lastRank) return undefined
    lastRank = rank
    const args = m[2]!.split(',')
    const a0 = args[0]
    const a1 = args[1]
    if (args.length > 2 || (a0 !== undefined && a0.trim() === '')) return undefined
    switch (name) {
      case 'translate': {
        const x = arg(a0, 'px')
        const y = a1 === undefined ? 0 : arg(a1, 'px')
        if (x === undefined || y === undefined || !take('tx') || !take('ty')) return undefined
        out.translateX = x
        out.translateY = y
        break
      }
      case 'translatex':
      case 'translatey': {
        const n = arg(a0, 'px')
        const key = name === 'translatex' ? 'tx' : 'ty'
        if (n === undefined || a1 !== undefined || !take(key)) return undefined
        if (key === 'tx') out.translateX = n
        else out.translateY = n
        break
      }
      case 'rotate': {
        const n = arg(a0, 'deg')
        if (n === undefined || a1 !== undefined || !take('r')) return undefined
        out.rotate = n
        break
      }
      case 'scale': {
        const x = arg(a0, '')
        const y = a1 === undefined ? x : arg(a1, '')
        if (x === undefined || y === undefined || !take('sx') || !take('sy')) return undefined
        out.scaleX = x
        out.scaleY = y
        break
      }
      case 'scalex':
      case 'scaley': {
        const n = arg(a0, '')
        const key = name === 'scalex' ? 'sx' : 'sy'
        if (n === undefined || a1 !== undefined || !take(key)) return undefined
        if (key === 'sx') out.scaleX = n
        else out.scaleY = n
        break
      }
      case 'skew': {
        const x = arg(a0, 'deg')
        const y = a1 === undefined ? 0 : arg(a1, 'deg')
        if (x === undefined || y === undefined || !take('kx') || !take('ky')) return undefined
        out.skewX = x
        out.skewY = y
        break
      }
      case 'skewx':
      case 'skewy': {
        const n = arg(a0, 'deg')
        const key = name === 'skewx' ? 'kx' : 'ky'
        if (n === undefined || a1 !== undefined || !take(key)) return undefined
        if (key === 'kx') out.skewX = n
        else out.skewY = n
        break
      }
    }
  }
  return out
}

export function composeTransform(t: TransformParts): string {
  const fns: string[] = []
  if (t.translateX !== 0 || t.translateY !== 0)
    fns.push(`translate(${fmtNum(t.translateX)}px, ${fmtNum(t.translateY)}px)`)
  if (t.rotate !== 0) fns.push(`rotate(${fmtNum(t.rotate)}deg)`)
  if (t.scaleX !== 1 || t.scaleY !== 1) fns.push(`scale(${fmtNum(t.scaleX)}, ${fmtNum(t.scaleY)})`)
  if (t.skewX !== 0 || t.skewY !== 0) fns.push(`skew(${fmtNum(t.skewX)}deg, ${fmtNum(t.skewY)}deg)`)
  return fns.length === 0 ? 'none' : fns.join(' ')
}
