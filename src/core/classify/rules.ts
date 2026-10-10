import { createRegistry } from '../plugin'
import type { ClassifyFeatures as F } from './features'

// 各ルールは 0〜1 のスコアを返す(0 = 該当なし)。カテゴリごとの最大値で競わせる
export type ClassifyRule = { id: string; category: string; score(f: F): number }

export const ruleRegistry = createRegistry<ClassifyRule>('classify-rule')
export const registerRule = (r: ClassifyRule) => ruleRegistry.register(r)
const add = (id: string, category: string, score: (f: F) => number) =>
  registerRule({ id, category, score })

// ---- タグ ----
const TAGS: [string, string, number][] = [
  ...(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((t) => [t, 'text-heading', 0.95]) as [
    string,
    string,
    number,
  ][]),
  ['p', 'text-body', 0.85],
  ['span', 'text-body', 0.6],
  ['strong', 'text-body', 0.7],
  ['em', 'text-body', 0.7],
  ['small', 'text-body', 0.7],
  ['label', 'label', 0.9],
  ['button', 'button', 0.95],
  ['a', 'link', 0.9],
  ['select', 'select', 0.95],
  ['textarea', 'textarea', 0.95],
  ['img', 'image', 0.95],
  ['hr', 'divider', 0.95],
  ['nav', 'nav', 0.9],
  ['header', 'header', 0.85],
  ['footer', 'footer', 0.85],
  ['aside', 'sidebar', 0.8],
  ['section', 'section', 0.8],
  ['article', 'section', 0.8],
  ['main', 'section', 0.8],
  ['ul', 'list', 0.9],
  ['ol', 'list', 0.9],
  ['li', 'list-item', 0.9],
  ['table', 'table', 0.9],
  ['form', 'form', 0.9],
  ['dialog', 'modal', 0.9],
]
for (const [tag, cat, s] of TAGS) add(`tag:${tag}`, cat, (f) => (f.tag === tag ? s : 0))

// ---- input の type ----
const INPUT: Record<string, [string, number]> = {
  checkbox: ['input-checkbox', 0.95],
  radio: ['input-radio', 0.95],
  range: ['slider', 0.95],
  button: ['button', 0.9],
  submit: ['button', 0.9],
  reset: ['button', 0.9],
}
for (const [type, [cat, s]] of Object.entries(INPUT)) {
  add(`input:${type}`, cat, (f) => (f.tag === 'input' && f.inputType === type ? s : 0))
}
add('input:text', 'input-text', (f) =>
  f.tag === 'input' && !(f.inputType in INPUT)
    ? f.inputType === '' || /^(text|email|password|search|tel|url|number)$/.test(f.inputType)
      ? 0.95
      : 0.6
    : 0,
)

// ---- role / aria ----
const ROLES: [string, string, number][] = [
  ['switch', 'toggle', 0.95],
  ['button', 'button', 0.9],
  ['tablist', 'tabs', 0.9],
  ['tab', 'tabs', 0.6],
  ['navigation', 'nav', 0.9],
  ['dialog', 'modal', 0.9],
  ['alertdialog', 'modal', 0.9],
  ['slider', 'slider', 0.95],
  ['checkbox', 'input-checkbox', 0.9],
  ['radio', 'input-radio', 0.9],
  ['separator', 'divider', 0.9],
  ['list', 'list', 0.9],
  ['listitem', 'list-item', 0.9],
  ['link', 'link', 0.9],
  ['heading', 'text-heading', 0.9],
  ['textbox', 'input-text', 0.9],
  ['combobox', 'select', 0.85],
  ['listbox', 'select', 0.85],
  ['img', 'image', 0.9],
  ['banner', 'header', 0.85],
  ['contentinfo', 'footer', 0.85],
  ['complementary', 'sidebar', 0.85],
  ['main', 'section', 0.8],
  ['form', 'form', 0.9],
  ['table', 'table', 0.9],
  ['region', 'section', 0.7],
]
for (const [role, cat, s] of ROLES) add(`role:${role}`, cat, (f) => (f.role === role ? s : 0))

// ---- class 名のトークン ----
const CLASSES: [string, string, number][] = [
  ['card', 'card', 0.7],
  ['btn', 'button', 0.7],
  ['button', 'button', 0.7],
  ['modal', 'modal', 0.7],
  ['dialog', 'modal', 0.6],
  ['nav', 'nav', 0.6],
  ['navbar', 'nav', 0.7],
  ['menu', 'nav', 0.5],
  ['sidebar', 'sidebar', 0.7],
  ['tabs', 'tabs', 0.7],
  ['tab', 'tabs', 0.5],
  ['switch', 'toggle', 0.7],
  ['toggle', 'toggle', 0.7],
  ['slider', 'slider', 0.6],
  ['header', 'header', 0.6],
  ['footer', 'footer', 0.6],
  ['list', 'list', 0.6],
  ['item', 'list-item', 0.4],
  ['divider', 'divider', 0.7],
  ['separator', 'divider', 0.7],
  ['icon', 'icon', 0.7],
  ['label', 'label', 0.6],
  ['title', 'text-heading', 0.5],
  ['heading', 'text-heading', 0.6],
  ['section', 'section', 0.5],
  ['form', 'form', 0.5],
]
for (const [tok, cat, s] of CLASSES) {
  add(`class:${tok}`, cat, (f) => (f.classTokens.includes(tok) ? s : 0))
}

// ---- 種別・スタイル ----
add('type:image', 'image', (f) => (f.nodeType === 'image' ? 0.95 : 0))
add('type:text', 'text-body', (f) => (f.nodeType === 'text' ? 0.7 : 0))
add('type:svg-icon', 'icon', (f) => {
  if (f.nodeType !== 'svg') return 0
  const m = Math.max(f.width ?? 0, f.height ?? 0)
  return m === 0 ? 0.6 : m <= 48 ? 0.85 : 0.4
})
add('type:svg-image', 'image', (f) => {
  if (f.nodeType !== 'svg') return 0
  return Math.max(f.width ?? 0, f.height ?? 0) > 48 ? 0.6 : 0
})
add('style:card', 'card', (f) =>
  f.nodeType === 'element' && f.childCount > 0 && f.radius > 0 && (f.hasBorder || f.hasShadow)
    ? 0.6
    : 0,
)
add('style:button', 'button', (f) =>
  f.nodeType === 'element' &&
  f.cursorPointer &&
  f.text !== '' &&
  f.childCount === 0 &&
  (f.hasBackground || f.hasBorder)
    ? 0.6
    : 0,
)
add('style:toggle', 'toggle', (f) => {
  const { width: w, height: h } = f
  if (f.nodeType !== 'element' || !w || !h || f.childCount > 1) return 0
  const ratio = w / h
  return h <= 40 && ratio >= 1.5 && ratio <= 2.6 && f.radius >= h * 0.4 ? 0.6 : 0
})
add('style:divider', 'divider', (f) => {
  const { width: w, height: h } = f
  if (f.nodeType !== 'element' || f.childCount > 0 || f.text !== '' || !w || !h) return 0
  return (h <= 2 && w >= h * 8) || (w <= 2 && h >= w * 8) ? 0.6 : 0
})
add('style:heading', 'text-heading', (f) =>
  f.nodeType === 'element' &&
  f.childCount === 0 &&
  f.text !== '' &&
  f.text.length <= 60 &&
  (f.fontSize ?? 0) >= 20
    ? 0.55
    : 0,
)
add('style:text-leaf', 'text-body', (f) =>
  f.nodeType === 'element' && f.childCount === 0 && f.text !== '' ? 0.55 : 0,
)

// ---- フォールバック ----
add('fallback:container', 'container', (f) =>
  f.nodeType !== 'element' ? 0 : f.childCount > 0 ? 0.5 : 0.4,
)
