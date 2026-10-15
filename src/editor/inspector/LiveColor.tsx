import { createContext, useContext, useEffect, useEffectEvent, useRef, useState } from 'react'

type Props = { value: string; label: string; width: number; onChange: (v: string) => void }

// ピッカーを閉じた時に呼ばれる(Inspector / StatePanel が history.breakCoalescing を渡す)
export const ColorEndContext = createContext<() => void>(() => {})

// ドラッグ中は表示をローカルで保持し、ドキュメントへの反映は 1 フレームに 1 回にする
export function LiveColor({ value, label, width, onChange }: Props) {
  const [local, setLocal] = useState(value)
  const [prev, setPrev] = useState(value)
  const [lastSent, setLastSent] = useState(value)
  const pending = useRef(value)
  const raf = useRef(0)
  const ref = useRef<HTMLInputElement>(null)
  const onEnd = useContext(ColorEndContext)
  if (prev !== value) {
    setPrev(value)
    // 自分が送った値の反映なら表示は戻さない(Undo など外部の変更だけ追従)
    if (value !== lastSent) setLocal(value)
  }

  // 保留中の最終値を先に確定してから、履歴の区切りを入れる
  const finish = () => {
    if (raf.current) {
      cancelAnimationFrame(raf.current)
      raf.current = 0
      setLastSent(pending.current)
      onChange(pending.current)
    }
    onEnd()
  }
  const finishEvent = useEffectEvent(finish)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const h = () => finishEvent()
    el.addEventListener('change', h) // ネイティブの change はピッカーを閉じた時に発火する
    return () => el.removeEventListener('change', h)
  }, [])

  return (
    <input
      ref={ref}
      type="color"
      aria-label={label}
      value={local}
      style={{ width, padding: 0, flexShrink: 0 }}
      onBlur={finish}
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
