import {
  createAssetUrlStore,
  createDocumentStore,
  createEmptyDocument,
  createFontLoader,
  createHistory,
  createIndexedDbBlobStore,
} from '@/core'

// アプリ全体で共有するドキュメントと履歴(自動保存・復旧の結線は Phase 5 以降)
export const docStore = createDocumentStore(createEmptyDocument('Untitled'))
export const history = createHistory(docStore)

// アセットのバイナリ(IndexedDB。最初に使うまで開かない)と、描画用 Blob URL
export const blobStore = createIndexedDbBlobStore()
export const assetUrls = createAssetUrlStore()
// doc.assets のフォントを FontFace として登録する
export const fontLoader = createFontLoader()
