import type { Props } from '@/core'
import { propRegistry, type Label, type PropDef, type PropRegistry } from './registry'

type G = keyof Props
type Opt = Partial<Omit<PropDef, 'key' | 'group' | 'label' | 'type'>>

const L = (ja: string, en: string): Label => ({ ja, en })
const SIDES = [
  ['Top', '上', 'Top'],
  ['Right', '右', 'Right'],
  ['Bottom', '下', 'Bottom'],
  ['Left', '左', 'Left'],
] as const
const CORNERS = [
  ['TopLeft', '左上', 'Top-left'],
  ['TopRight', '右上', 'Top-right'],
  ['BottomRight', '右下', 'Bottom-right'],
  ['BottomLeft', '左下', 'Bottom-left'],
] as const

const base = (group: G, key: string, ja: string, en: string, o: Opt) => ({
  key,
  group,
  label: L(ja, en),
  deviceOverridable: true,
  ...o,
})
const len = (
  group: G,
  key: string,
  ja: string,
  en: string,
  units: string[],
  o: Opt = {},
): PropDef => ({
  ...base(group, key, ja, en, o),
  type: 'length',
  units,
})
const num = (group: G, key: string, ja: string, en: string, o: Opt = {}): PropDef => ({
  ...base(group, key, ja, en, o),
  type: 'number',
})
const text = (group: G, key: string, ja: string, en: string, o: Opt = {}): PropDef => ({
  ...base(group, key, ja, en, o),
  type: 'text',
})
const color = (group: G, key: string, ja: string, en: string, o: Opt = {}): PropDef => ({
  ...base(group, key, ja, en, o),
  type: 'color',
})
const sel = (
  group: G,
  key: string,
  ja: string,
  en: string,
  values: string[],
  o: Opt = {},
): PropDef => ({
  ...base(group, key, ja, en, o),
  type: 'select',
  options: values.map((v) => ({ value: v, label: L(v, v) })),
})

const SIZE_U = ['px', '%', 'rem', 'em', 'vw', 'vh', 'auto']
const MAX_U = ['px', '%', 'rem', 'em', 'vw', 'vh', 'none']
const SPACE_U = ['px', '%', 'rem', 'em']
const MARGIN_U = ['px', '%', 'rem', 'em', 'auto']
const OFFSET_U = ['px', '%', 'rem', 'em', 'auto']
const FONT_U = ['px', 'rem', 'em', '%']
const LH_U = ['px', 'rem', 'em', '%', 'normal']
const TIME_U = ['s', 'ms']
// リンク先を付けられるカテゴリ
const LINKABLE = [
  'link',
  'button',
  'card',
  'list-item',
  'nav',
  'tabs',
  'image',
  'icon',
  'text-heading',
  'text-body',
  'label',
  'container',
  'section',
  'header',
  'footer',
]

const IMG = ['image', 'icon']
const TEXT_IN = ['input-text', 'textarea']

export const BUILTIN_PROPS: PropDef[] = [
  // Layout
  sel('layout', 'display', '表示方式', 'Display', [
    'block',
    'inline',
    'inline-block',
    'flex',
    'inline-flex',
    'grid',
    'inline-grid',
    'none',
    'contents',
  ]),
  sel('layout', 'flexDirection', 'フレックス方向', 'Flex direction', [
    'row',
    'row-reverse',
    'column',
    'column-reverse',
  ]),
  sel('layout', 'flexWrap', '折り返し', 'Flex wrap', ['nowrap', 'wrap', 'wrap-reverse']),
  sel('layout', 'justifyContent', '主軸配置', 'Justify content', [
    'normal',
    'flex-start',
    'flex-end',
    'center',
    'space-between',
    'space-around',
    'space-evenly',
  ]),
  sel('layout', 'alignItems', '交差軸配置', 'Align items', [
    'normal',
    'stretch',
    'flex-start',
    'flex-end',
    'center',
    'baseline',
  ]),
  sel('layout', 'alignContent', '行の配置', 'Align content', [
    'normal',
    'stretch',
    'flex-start',
    'flex-end',
    'center',
    'space-between',
    'space-around',
  ]),
  sel('layout', 'alignSelf', '自身の配置', 'Align self', [
    'auto',
    'stretch',
    'flex-start',
    'flex-end',
    'center',
    'baseline',
  ]),
  len('layout', 'rowGap', '行の間隔', 'Row gap', SPACE_U, { min: 0 }),
  len('layout', 'columnGap', '列の間隔', 'Column gap', SPACE_U, { min: 0 }),
  num('layout', 'flexGrow', '伸長率', 'Flex grow', { min: 0, step: 1 }),
  num('layout', 'flexShrink', '縮小率', 'Flex shrink', { min: 0, step: 1 }),
  len('layout', 'flexBasis', '基準サイズ', 'Flex basis', SIZE_U, { min: 0 }),
  text('layout', 'gridTemplateColumns', 'グリッド列', 'Grid columns'),
  text('layout', 'gridTemplateRows', 'グリッド行', 'Grid rows'),
  sel('layout', 'overflow', 'はみ出し', 'Overflow', [
    'visible',
    'hidden',
    'scroll',
    'auto',
    'clip',
  ]),
  sel('layout', 'boxSizing', 'ボックスサイズ', 'Box sizing', ['content-box', 'border-box']),
  ...SIDES.map(([s, ja, en]) =>
    len('layout', `margin${s}`, `外側余白 ${ja}`, `Margin ${en}`, MARGIN_U),
  ),
  ...SIDES.map(([s, ja, en]) =>
    len('layout', `padding${s}`, `内側余白 ${ja}`, `Padding ${en}`, SPACE_U, { min: 0 }),
  ),

  // Size
  len('size', 'width', '幅', 'Width', SIZE_U, { min: 0 }),
  len('size', 'height', '高さ', 'Height', SIZE_U, { min: 0 }),
  len('size', 'minWidth', '最小幅', 'Min width', SIZE_U, { min: 0 }),
  len('size', 'maxWidth', '最大幅', 'Max width', MAX_U, { min: 0 }),
  len('size', 'minHeight', '最小高さ', 'Min height', SIZE_U, { min: 0 }),
  len('size', 'maxHeight', '最大高さ', 'Max height', MAX_U, { min: 0 }),
  text('size', 'aspectRatio', '縦横比', 'Aspect ratio'),

  // Position
  sel('position', 'position', '配置方式', 'Position', [
    'static',
    'relative',
    'absolute',
    'fixed',
    'sticky',
  ]),
  ...SIDES.map(([s, ja, en]) =>
    len('position', s.toLowerCase(), `位置 ${ja}`, `Offset ${en}`, OFFSET_U),
  ),
  num('position', 'zIndex', '重なり順', 'z-index', { step: 1 }),

  // Appearance
  color('appearance', 'backgroundColor', '背景色', 'Background color'),
  text('appearance', 'backgroundImage', '背景画像/グラデーション', 'Background image'),
  text('appearance', 'backgroundSize', '背景サイズ', 'Background size'),
  text('appearance', 'backgroundPosition', '背景位置', 'Background position'),
  sel(
    'appearance',
    'objectFit',
    '画像のフィット',
    'Image fit',
    ['fill', 'cover', 'contain', 'none', 'scale-down'],
    {
      appliesTo: IMG,
    },
  ),
  text('appearance', 'objectPosition', '画像の位置', 'Image position', { appliesTo: IMG }),
  sel('appearance', 'backgroundRepeat', '背景の繰り返し', 'Background repeat', [
    'repeat',
    'no-repeat',
    'repeat-x',
    'repeat-y',
  ]),
  num('appearance', 'opacity', '不透明度', 'Opacity', {
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 1,
  }),
  sel('appearance', 'mixBlendMode', '混合モード', 'Blend mode', [
    'normal',
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'color-dodge',
    'color-burn',
    'difference',
    'exclusion',
  ]),
  sel('appearance', 'cursor', 'カーソル', 'Cursor', [
    'auto',
    'default',
    'pointer',
    'text',
    'move',
    'not-allowed',
    'grab',
    'crosshair',
  ]),
  sel('appearance', 'visibility', '可視性', 'Visibility', ['visible', 'hidden', 'collapse']),

  // Border(辺ごと)
  ...SIDES.flatMap(([s, ja, en]) => [
    len(
      'border',
      `border${s}Width`,
      `枠線の太さ ${ja}`,
      `Border width ${en}`,
      ['px', 'rem', 'em'],
      {
        min: 0,
      },
    ),
    sel('border', `border${s}Style`, `枠線の種類 ${ja}`, `Border style ${en}`, [
      'none',
      'solid',
      'dashed',
      'dotted',
      'double',
    ]),
    color('border', `border${s}Color`, `枠線の色 ${ja}`, `Border color ${en}`),
  ]),

  // Radius(角ごと)
  ...CORNERS.map(([c, ja, en]) =>
    len('radius', `border${c}Radius`, `角丸 ${ja}`, `Radius ${en}`, ['px', '%', 'rem', 'em'], {
      min: 0,
    }),
  ),

  // Shadow(複数指定は 6-C の影エディタが文字列を合成)
  text('shadow', 'boxShadow', '影(ボックス)', 'Box shadow'),
  text('shadow', 'textShadow', '影(テキスト)', 'Text shadow'),

  // Effects
  text('effects', 'filter', 'フィルター', 'Filter'),
  text('effects', 'backdropFilter', '背景ぼかし等', 'Backdrop filter'),

  // Transform(単一文字列。個別入力は 6-C で分解・合成)
  text('transform', 'transform', '変形', 'Transform', { defaultValue: 'none' }),
  text('transform', 'transformOrigin', '変形の基準点', 'Transform origin'),

  // Typography
  text('typography', 'fontFamily', 'フォント', 'Font family'),
  len('typography', 'fontSize', '文字サイズ', 'Font size', FONT_U, { min: 0 }),
  sel('typography', 'fontWeight', '太さ', 'Font weight', [
    '100',
    '200',
    '300',
    '400',
    '500',
    '600',
    '700',
    '800',
    '900',
    'normal',
    'bold',
  ]),
  sel('typography', 'fontStyle', 'スタイル', 'Font style', ['normal', 'italic', 'oblique']),
  len('typography', 'lineHeight', '行の高さ', 'Line height', LH_U, { min: 0 }),
  len('typography', 'letterSpacing', '字間', 'Letter spacing', ['px', 'em', 'rem', 'normal']),
  sel('typography', 'textAlign', '文字揃え', 'Text align', [
    'start',
    'left',
    'center',
    'right',
    'justify',
    'end',
  ]),
  sel('typography', 'textDecorationLine', '装飾線', 'Text decoration', [
    'none',
    'underline',
    'line-through',
    'overline',
  ]),
  sel('typography', 'textTransform', '大文字小文字', 'Text transform', [
    'none',
    'uppercase',
    'lowercase',
    'capitalize',
  ]),
  color('typography', 'color', '文字色', 'Text color'),
  sel('typography', 'whiteSpace', '空白の扱い', 'White space', [
    'normal',
    'nowrap',
    'pre',
    'pre-wrap',
    'pre-line',
  ]),

  // Content(内容はデバイス共通)
  text('content', 'text', 'テキスト', 'Text', { deviceOverridable: false }),
  text('content', 'src', '画像URL', 'Source', { appliesTo: IMG, deviceOverridable: false }),
  text('content', 'alt', '代替テキスト', 'Alt text', { appliesTo: IMG, deviceOverridable: false }),
  text('content', 'href', 'リンク先', 'Link target', {
    appliesTo: LINKABLE,
    deviceOverridable: false,
  }),
  text('content', 'placeholder', 'プレースホルダー', 'Placeholder', {
    appliesTo: TEXT_IN,
    deviceOverridable: false,
  }),
  text('content', 'value', '値', 'Value', {
    appliesTo: [...TEXT_IN, 'select', 'slider'],
    deviceOverridable: false,
  }),

  // Transition(Animation の keyframes は Phase 9-D)
  text('transition', 'transitionProperty', '対象プロパティ', 'Transition property'),
  len('transition', 'transitionDuration', '時間', 'Duration', TIME_U, { min: 0 }),
  sel('transition', 'transitionTimingFunction', 'イージング', 'Easing', [
    'ease',
    'linear',
    'ease-in',
    'ease-out',
    'ease-in-out',
  ]),
  len('transition', 'transitionDelay', '遅延', 'Delay', TIME_U, { min: 0 }),

  // Custom CSS(エスケープハッチ。描画への反映は 6-G)
  text('custom', 'customCss', 'カスタムCSS', 'Custom CSS', { deviceOverridable: false }),
]

// 同じ group.key は上書きされるので何度呼んでもよい
export function registerBuiltinProps(registry: PropRegistry = propRegistry): void {
  for (const d of BUILTIN_PROPS) registry.register(d)
}
