import { useRef } from 'react'
import { assetRefOf, type Asset } from '@/core'

type Props = {
  assets: readonly Asset[]
  value: unknown
  language: 'ja' | 'en'
  canReplaceFile: boolean
  onPick: (assetId: string) => void
  onFile: (file: File) => void
}

const T = {
  ja: { none: '(アセットを選択)', file: 'ファイルから差し替え', empty: 'アセットなし' },
  en: { none: '(choose asset)', file: 'Replace from file', empty: 'No assets' },
} as const

// content.src 用: 既存アセットから選ぶ / ファイルから差し替え
export function AssetPicker({ assets, value, language, canReplaceFile, onPick, onFile }: Props) {
  const t = T[language]
  const fileRef = useRef<HTMLInputElement>(null)
  const images = assets.filter((a) => a.kind === 'image' || a.kind === 'svg')
  const cur = assetRefOf(value) ?? ''
  return (
    <span style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <select
        aria-label="asset"
        value={images.some((a) => a.id === cur) ? cur : ''}
        style={{ flex: 1, minWidth: 0, fontSize: 12 }}
        onChange={(e) => e.target.value && onPick(e.target.value)}
      >
        <option value="">{images.length === 0 ? t.empty : t.none}</option>
        {images.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {canReplaceFile && (
        <>
          <button type="button" style={{ fontSize: 12 }} onClick={() => fileRef.current?.click()}>
            {t.file}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
              e.target.value = ''
            }}
          />
        </>
      )}
    </span>
  )
}
