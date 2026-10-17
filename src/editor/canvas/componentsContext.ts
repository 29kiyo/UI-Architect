import { createContext } from 'react'
import type { ComponentDef } from '@/core'

// インスタンスの展開に使う定義一覧(App が Provider で注入する。未注入なら定義なし扱い)
export const ComponentsContext = createContext<ComponentDef[]>([])
