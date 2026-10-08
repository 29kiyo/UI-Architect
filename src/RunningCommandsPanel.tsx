import { useSyncExternalStore } from 'react'
import { logger } from '@/shared'

export function RunningCommandsPanel({ title }: { title: string }) {
  const entries = useSyncExternalStore(logger.subscribe, logger.getEntries)
  const time = (t: number) => new Date(t).toLocaleTimeString()

  return (
    <section
      aria-label={title}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '30vh',
        overflow: 'auto',
        textAlign: 'left',
        padding: '8px 16px',
        fontFamily: 'var(--mono)',
        fontSize: 13,
        background: 'var(--code-bg)',
        borderTop: '1px solid var(--border)',
      }}
    >
      <strong>{title}</strong>
      {entries.length === 0 && <div>-</div>}
      {entries.map((e) => (
        <div key={e.id}>
          {time(e.time)} [{e.level}] {e.message}
          {e.status ? ` (${e.status}${e.durationMs != null ? `, ${e.durationMs}ms` : ''})` : ''}
        </div>
      ))}
    </section>
  )
}
