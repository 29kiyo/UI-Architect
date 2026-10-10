import type { History } from '../history'
import type { UIDocument } from '../model'
import type { DocumentStore } from '../store'

// 読込・復旧・スナップショット復元でドキュメントを丸ごと差し替える。
// 履歴は破棄する(トランザクション中は throw し、差し替えない)。
export function replaceDocument(store: DocumentStore, history: History, doc: UIDocument): void {
  history.clear()
  store.getState().replace(doc)
}
