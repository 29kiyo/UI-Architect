import { categoryRegistry } from '@/core'
import { PALETTE_MIME } from './palette'

const TEXT = {
  ja: { title: '部品パレット', hint: 'キャンバスへドラッグして追加' },
  en: { title: 'Palette', hint: 'Drag onto the canvas to add' },
} as const

export function Palette({ language }: { language: 'ja' | 'en' }) {
  const t = TEXT[language]
  return (
    <section aria-label={t.title} style={{ textAlign: 'left', fontSize: 13 }}>
      <strong>{t.title}</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0' }}>
        {categoryRegistry.list().map((c) => (
          <div
            key={c.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(PALETTE_MIME, c.id)
              e.dataTransfer.setData('text/plain', c.id)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            style={{
              padding: '2px 6px',
              border: '1px solid var(--border)',
              borderRadius: 4,
              cursor: 'grab',
              userSelect: 'none',
            }}
          >
            {language === 'ja' ? c.label : c.id}
          </div>
        ))}
      </div>
      <small>{t.hint}</small>
    </section>
  )
}
