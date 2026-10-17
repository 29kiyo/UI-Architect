import type { Command } from '../history'
import {
  createPage,
  type Id,
  type Master,
  type MasterPosition,
  type Page,
  type UIDocument,
} from '../model'

// ページ or マスターを ID で探す(編集 UI は両方を同じように扱う)
export function findEditablePage(doc: UIDocument, id: Id | undefined): Page | undefined {
  return doc.pages.find((p) => p.id === id) ?? doc.masters.find((m) => m.id === id)
}

// このページに表示するマスター(hiddenMasterIds に入っていないもの)
export function visibleMasters(doc: UIDocument, page: Page): Master[] {
  const hidden = page.hiddenMasterIds ?? []
  return doc.masters.filter((m) => !hidden.includes(m.id))
}

// 新規マスター(まだドキュメントには入れない)
export function createMasterFor(doc: UIDocument, position: MasterPosition = 'top'): Master {
  const names = new Set(doc.masters.map((m) => m.name))
  let n = doc.masters.length + 1
  while (names.has(`Master ${n}`)) n++
  return { ...createPage(`Master ${n}`, ''), position }
}

function indexOfMaster(d: UIDocument, id: Id): number {
  const i = d.masters.findIndex((m) => m.id === id)
  if (i < 0) throw new Error(`master not found: ${id}`)
  return i
}

export const createAddMasterCommand = (master: Master): Command => ({
  name: 'add master',
  apply: (d) => {
    d.masters.push(structuredClone(master))
  },
})

export const createRemoveMasterCommand = (masterId: Id): Command => ({
  name: 'remove master',
  apply: (d) => {
    d.masters.splice(indexOfMaster(d, masterId), 1)
    // 各ページの「隠す」指定からも外す
    for (const p of d.pages) {
      if (!p.hiddenMasterIds) continue
      const next = p.hiddenMasterIds.filter((x) => x !== masterId)
      if (next.length > 0) p.hiddenMasterIds = next
      else delete p.hiddenMasterIds
    }
  },
})

export const createRenameMasterCommand = (masterId: Id, name: string): Command => ({
  name: 'rename master',
  apply: (d) => {
    const n = name.trim()
    if (!n) throw new Error('マスター名が空です')
    d.masters[indexOfMaster(d, masterId)]!.name = n
  },
})

export const createSetMasterPositionCommand = (
  masterId: Id,
  position: MasterPosition,
): Command => ({
  name: 'set master position',
  apply: (d) => {
    d.masters[indexOfMaster(d, masterId)]!.position = position
  },
})

export const createMoveMasterCommand = (masterId: Id, toIndex: number): Command => ({
  name: 'move master',
  apply: (d) => {
    const [m] = d.masters.splice(indexOfMaster(d, masterId), 1)
    if (!m) return
    d.masters.splice(Math.max(0, Math.min(toIndex, d.masters.length)), 0, m)
  },
})

// ページ別にマスターを隠す / 戻す
export const createSetMasterHiddenCommand = (
  pageId: Id,
  masterId: Id,
  hidden: boolean,
): Command => ({
  name: hidden ? 'hide master' : 'show master',
  apply: (d) => {
    indexOfMaster(d, masterId)
    const page = d.pages.find((p) => p.id === pageId)
    if (!page) throw new Error(`page not found: ${pageId}`)
    const cur = page.hiddenMasterIds ?? []
    const next = hidden
      ? cur.includes(masterId)
        ? cur
        : [...cur, masterId]
      : cur.filter((x) => x !== masterId)
    if (next.length > 0) page.hiddenMasterIds = next
    else delete page.hiddenMasterIds
  },
})

// 編集系 Command が対象を探すための一覧(ページ + マスター。どちらも Page と同じ形)
export function allPages(doc: Pick<UIDocument, 'pages' | 'masters'>): Page[] {
  return [...doc.pages, ...doc.masters]
}
