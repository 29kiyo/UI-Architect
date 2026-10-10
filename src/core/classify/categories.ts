import type { PropGroup, Props } from '../model'
import { createRegistry } from '../plugin'

// カテゴリ定義。拡張は registerCategory で追加するだけ
export type CategoryDef = {
  id: string
  label: string
  defaultProps: Partial<Record<keyof Props, PropGroup>>
  allowedChildren: 'any' | 'none' | string[] // 許可する子カテゴリ
  eventCandidates: string[] // イベント候補(Phase 9 の trigger 名)
}

export const categoryRegistry = createRegistry<CategoryDef>('category')
export const registerCategory = (c: CategoryDef) => categoryRegistry.register(c)
export const getCategory = (id: string) => categoryRegistry.get(id)
export const listCategories = () => categoryRegistry.list()
export const isKnownCategory = (id: string) => categoryRegistry.get(id) !== undefined

type Opt = Partial<Omit<CategoryDef, 'id' | 'label'>>
const def = (id: string, label: string, o: Opt = {}): CategoryDef => ({
  id,
  label,
  defaultProps: {},
  allowedChildren: 'any',
  eventCandidates: [],
  ...o,
})

const LEAF: Opt = { allowedChildren: 'none' }
const INPUT_EVENTS = ['focus', 'blur', 'change', 'input']

const BUILTIN: CategoryDef[] = [
  def('container', 'コンテナ'),
  def('section', 'セクション'),
  def('header', 'ヘッダー'),
  def('footer', 'フッター'),
  def('sidebar', 'サイドバー'),
  def('nav', 'ナビゲーション', { eventCandidates: ['click'] }),
  def('tabs', 'タブ', { eventCandidates: ['click', 'change'] }),
  def('card', 'カード', { eventCandidates: ['click'] }),
  def('list', 'リスト', { allowedChildren: ['list-item'] }),
  def('list-item', 'リスト項目', { eventCandidates: ['click'] }),
  def('table', 'テーブル'),
  def('form', 'フォーム', { eventCandidates: ['submit'] }),
  def('text-heading', '見出し', LEAF),
  def('text-body', '本文', LEAF),
  def('label', 'ラベル', LEAF),
  def('button', 'ボタン', {
    defaultProps: {
      layout: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
      appearance: { cursor: 'pointer' },
    },
    eventCandidates: ['click', 'dblclick', 'hover'],
  }),
  def('link', 'リンク', { eventCandidates: ['click'] }),
  def('input-text', 'テキスト入力', { ...LEAF, eventCandidates: INPUT_EVENTS }),
  def('input-checkbox', 'チェックボックス', { ...LEAF, eventCandidates: ['change'] }),
  def('input-radio', 'ラジオ', { ...LEAF, eventCandidates: ['change'] }),
  def('select', 'セレクト', { ...LEAF, eventCandidates: ['change'] }),
  def('textarea', 'テキストエリア', { ...LEAF, eventCandidates: INPUT_EVENTS }),
  def('toggle', 'トグル', {
    defaultProps: { appearance: { cursor: 'pointer' } },
    eventCandidates: ['click', 'change'],
  }),
  def('slider', 'スライダー', { eventCandidates: ['change', 'input'] }),
  def('image', '画像', { ...LEAF, eventCandidates: ['click'] }),
  def('icon', 'アイコン', { ...LEAF, eventCandidates: ['click'] }),
  def('divider', '区切り線', LEAF),
  def('modal', 'モーダル', { eventCandidates: ['click'] }),
]
for (const c of BUILTIN) registerCategory(c)
