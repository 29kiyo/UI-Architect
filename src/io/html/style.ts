import type { PropGroup, Props } from '@/core'

// kebab-case の CSS プロパティ名 → 計算済みの値(無ければ '')
export type StyleGetter = (cssName: string) => string
export type MappedProps = Partial<Record<keyof Props, PropGroup>>

const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const SIDES = ['top', 'right', 'bottom', 'left'] as const
const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const
const TRANSPARENT = ['rgba(0, 0, 0, 0)', 'transparent']
const ZERO = ['0px', '0']

// [グループ, CSS名, 出力しない既定値]
const SIMPLE: [keyof Props, string, string[]][] = [
  ['layout', 'display', []],
  ['layout', 'flex-direction', ['row']],
  ['layout', 'flex-wrap', ['nowrap']],
  ['layout', 'justify-content', ['normal', 'flex-start']],
  ['layout', 'align-items', ['normal']],
  ['layout', 'align-content', ['normal']],
  ['layout', 'align-self', ['auto']],
  ['layout', 'row-gap', ['normal', ...ZERO]],
  ['layout', 'column-gap', ['normal', ...ZERO]],
  ['layout', 'flex-grow', ['0']],
  ['layout', 'flex-shrink', ['1']],
  ['layout', 'flex-basis', ['auto']],
  ['layout', 'grid-template-columns', ['none']],
  ['layout', 'grid-template-rows', ['none']],
  ['layout', 'overflow', ['visible']],
  ['layout', 'box-sizing', ['content-box']],
  ...SIDES.map((s): [keyof Props, string, string[]] => ['layout', `margin-${s}`, ZERO]),
  ...SIDES.map((s): [keyof Props, string, string[]] => ['layout', `padding-${s}`, ZERO]),
  ['size', 'width', ['auto']],
  ['size', 'height', ['auto']],
  ['size', 'min-width', ['auto', ...ZERO]],
  ['size', 'max-width', ['none']],
  ['size', 'min-height', ['auto', ...ZERO]],
  ['size', 'max-height', ['none']],
  ['size', 'aspect-ratio', ['auto']],
  ['position', 'position', ['static']],
  ...SIDES.map((s): [keyof Props, string, string[]] => ['position', s, ['auto']]),
  ['position', 'z-index', ['auto']],
  ['appearance', 'background-color', TRANSPARENT],
  ['appearance', 'background-image', ['none']],
  ['appearance', 'background-size', ['auto']],
  ['appearance', 'background-position', ['0% 0%', '0px 0px']],
  ['appearance', 'background-repeat', ['repeat']],
  ['appearance', 'opacity', ['1']],
  ['appearance', 'mix-blend-mode', ['normal']],
  ['appearance', 'cursor', ['auto']],
  ['appearance', 'visibility', ['visible']],
  ['shadow', 'box-shadow', ['none']],
  ['shadow', 'text-shadow', ['none']],
  ['effects', 'filter', ['none']],
  ['effects', 'backdrop-filter', ['none']],
  ['transform', 'transform', ['none']],
  ['typography', 'font-family', []],
  ['typography', 'font-size', []],
  ['typography', 'font-weight', ['400', 'normal']],
  ['typography', 'font-style', ['normal']],
  ['typography', 'line-height', ['normal']],
  ['typography', 'letter-spacing', ['normal', ...ZERO]],
  ['typography', 'text-align', ['start']],
  ['typography', 'text-decoration-line', ['none']],
  ['typography', 'text-transform', ['none']],
  ['typography', 'color', []],
  ['typography', 'white-space', ['normal']],
  ['transition', 'transition-property', ['all']],
  ['transition', 'transition-duration', ['0s']],
  ['transition', 'transition-timing-function', ['ease']],
  ['transition', 'transition-delay', ['0s']],
]

export function mapComputedStyle(get: StyleGetter): MappedProps {
  const out: Partial<Record<keyof Props, Record<string, string>>> = {}
  const put = (group: keyof Props, key: string, value: string) => {
    ;(out[group] ??= {})[key] = value
  }

  for (const [group, css, skip] of SIMPLE) {
    const v = get(css).trim()
    if (v !== '' && !skip.includes(v)) put(group, camel(css), v)
  }

  // transform-origin は transform があるときだけ
  if (out.transform?.transform) {
    const o = get('transform-origin').trim()
    if (o) put('transform', 'transformOrigin', o)
  }

  // 枠線: 実際に描画される辺だけ
  for (const side of SIDES) {
    const style = get(`border-${side}-style`).trim()
    const width = get(`border-${side}-width`).trim()
    if (
      style === '' ||
      style === 'none' ||
      style === 'hidden' ||
      width === '' ||
      ZERO.includes(width)
    ) {
      continue
    }
    const S = cap(side)
    put('border', `border${S}Width`, width)
    put('border', `border${S}Style`, style)
    const color = get(`border-${side}-color`).trim()
    if (color) put('border', `border${S}Color`, color)
  }

  // 角丸
  for (const corner of CORNERS) {
    const v = get(`border-${corner}-radius`).trim()
    if (v !== '' && !ZERO.includes(v)) put('radius', camel(`border-${corner}-radius`), v)
  }

  return out
}

// Record からの getter(テスト・スナップショット用)
export const styleGetterFrom =
  (styles: Record<string, string>): StyleGetter =>
  (name) =>
    styles[name] ?? ''
