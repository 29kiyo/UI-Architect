import { fontFamilyCss, fontFamilyOf, type Asset } from '@/core'

type Props = {
  assets: readonly Asset[]
  value: unknown
  language: 'ja' | 'en'
  onPick: (css: string) => void
}

// typography.fontFamily 用: プロジェクトに追加したフォントから選ぶ(無ければ出さない)
export function FontPicker({ assets, value, language, onPick }: Props) {
  const fonts = assets.filter((a) => a.kind === 'font')
  if (fonts.length === 0) return null
  const cur = typeof value === 'string' ? value : ''
  const match = fonts.find((a) => fontFamilyCss(fontFamilyOf(a)) === cur)
  return (
    <select
      aria-label="project font"
      value={match?.id ?? ''}
      style={{ width: '100%', fontSize: 12 }}
      onChange={(e) => {
        const a = fonts.find((x) => x.id === e.target.value)
        if (a) onPick(fontFamilyCss(fontFamilyOf(a)))
      }}
    >
      <option value="">{language === 'ja' ? '(プロジェクトのフォント)' : '(project font)'}</option>
      {fonts.map((a) => (
        <option key={a.id} value={a.id}>
          {fontFamilyOf(a)}
        </option>
      ))}
    </select>
  )
}
