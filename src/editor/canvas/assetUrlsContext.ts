import { createContext } from 'react'
import type { AssetUrlStore } from '@/core'

// asset:<id> の解決先(App が Provider で注入する。未注入なら asset: は描画されない)
export const AssetUrlsContext = createContext<AssetUrlStore | undefined>(undefined)
