import type { PropGroup } from '@/core'

const PSEUDO = ['hover', 'active', 'focus', 'focus-visible', 'disabled', 'checked']
const TRAIL = new RegExp(`^(.*?):(${PSEUDO.join('|')})$`)
const ANY = new RegExp(`:(${PSEUDO.join('|')})(?![\\w-])`)

const camel = (s: string) =>
  s.startsWith('--') ? s : s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

export type StateResolver = {
  getStates(el: Element): PropGroup
  warnings: string[]
}

type StateMap = Record<string, Record<string, string>>

// セレクタ末尾の擬似クラスのみ対応。詳細度は無視し、同キーは後勝ち。
// ショートハンドは書かれたまま保持(正規化は Phase 6)
export function buildStateResolver(root: Element): StateResolver {
  const doc = root.ownerDocument
  const map = new Map<Element, StateMap>()
  let skipped = 0

  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      const sel = (rule as CSSStyleRule).selectorText
      if (typeof sel !== 'string') continue
      const style = (rule as CSSStyleRule).style
      for (const part of sel.split(',')) {
        const s = part.trim()
        const m = TRAIL.exec(s)
        if (!m) {
          if (ANY.test(s)) skipped++
          continue
        }
        const base = m[1].trim() || '*'
        const state = camel(m[2])
        let els: Element[]
        try {
          els = Array.from(root.querySelectorAll(base))
        } catch {
          skipped++
          continue
        }
        for (const el of els) {
          const entry = map.get(el) ?? {}
          const target = (entry[state] ??= {})
          for (let i = 0; i < style.length; i++) {
            const name = style[i]
            target[camel(name)] = style.getPropertyValue(name).trim()
          }
          map.set(el, entry)
        }
      }
    }
  }

  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      visit(sheet.cssRules)
    } catch {
      // 読めないシートは無視
    }
  }

  return {
    getStates: (el) => map.get(el) ?? {},
    warnings:
      skipped > 0 ? [`複合セレクタの擬似クラス ${skipped} 件は states に反映していません`] : [],
  }
}
