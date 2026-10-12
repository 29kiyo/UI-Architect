import type { Props } from '@/core'

export type PropValue = string | number | boolean

// 入力コントロールの種別。6-C で gradient / shadow / font などを追加する
export type PropType = 'text' | 'number' | 'length' | 'color' | 'select' | 'boolean'

export type Label = { ja: string; en: string }

export type PropOption = { value: string; label: Label }

// props[group][key] に入る値の定義。インスペクタ UI はこれから自動生成する
export type PropDef = {
  // CSS を描画するグループ(layout〜transition)では camelCase の CSS プロパティ名にする
  key: string
  group: keyof Props
  label: Label
  type: PropType
  units?: string[] // length 型で選べる単位(例: ['px', '%', 'rem', 'auto'])
  min?: number
  max?: number
  step?: number
  options?: PropOption[] // select 型
  defaultValue?: PropValue
  appliesTo?: string[] // 対象カテゴリ。省略は全カテゴリ
  deviceOverridable: boolean // false ならデバイス別上書き不可(常に共通値)
  cssMapping?: string // kebab-case の CSS プロパティ名。key と異なる場合・出力用
}

const idOf = (group: keyof Props, key: string) => `${group}.${key}`

export function createPropRegistry() {
  const defs = new Map<string, PropDef>()
  return {
    // 同じ group.key は上書き
    register(def: PropDef): void {
      defs.set(idOf(def.group, def.key), def)
    },
    get(group: keyof Props, key: string): PropDef | undefined {
      return defs.get(idOf(group, key))
    },
    all(): PropDef[] {
      return [...defs.values()]
    },
    forGroup(group: keyof Props): PropDef[] {
      return [...defs.values()].filter((d) => d.group === group)
    },
    // category に適用できる定義(appliesTo 省略は全カテゴリ)
    forCategory(category: string, group?: keyof Props): PropDef[] {
      return [...defs.values()].filter(
        (d) =>
          (group === undefined || d.group === group) &&
          (d.appliesTo === undefined || d.appliesTo.includes(category)),
      )
    },
  }
}

export type PropRegistry = ReturnType<typeof createPropRegistry>

export const propRegistry = createPropRegistry()
export const registerProp = propRegistry.register
