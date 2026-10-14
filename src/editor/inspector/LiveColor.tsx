import { useRef, useState } from 'react'

type Props = { value: string; label: string; width: number; onChange: (v: string) => void }

// ドラッグ中は表示をローカルで保持し、ドキュメントへの反映は 1 フレームに 1 回にする
export function LiveColor({ value, label, width, onChange }: Props) {
  const [local, setLocal] = useState(value)
  const [prev, setPrev] = useState(value)
  const [lastSent, setLastSent] = useState(value)
  const pending = useRef(value)
  const raf = useRef(0)
  if (prev !== value) {
    setPrev(value)
    // 自分が送った値の反映なら表示は戻さない(Undo など外部の変更だけ追従)
    if (value !== lastSent) setLocal(value)
  }
  return (
    <input
      type="color"
      aria-label={label}
      value={local}
      style={{ width, padding: 0, flexShrink: 0 }}
      onChange={(e) => {
        const v = e.target.value
        setLocal(v)
        pending.current = v
        if (raf.current) return
        raf.current = requestAnimationFrame(() => {
          raf.current = 0
          setLastSent(pending.current)
          onChange(pending.current)
        })
      }}
    />
  )
}
