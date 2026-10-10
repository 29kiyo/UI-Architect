import { createDocumentStore, createEmptyDocument, createHistory } from '@/core'

// アプリ全体で共有するドキュメントと履歴(自動保存・復旧の結線は Phase 5 以降)
export const docStore = createDocumentStore(createEmptyDocument('Untitled'))
export const history = createHistory(docStore)
