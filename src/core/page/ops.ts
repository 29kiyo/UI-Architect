import type { Command } from '../history'
import { createPage, newId, type Id, type Page, type UIDocument } from '../model'

// ホームページ: project.homePageId、未設定または存在しなければ pages[0]
export function getHomePage(doc: UIDocument): Page | undefined {
  const id = doc.project.homePageId
  return doc.pages.find((p) => p.id === id) ?? doc.pages[0]
}

export const canRemovePage = (doc: UIDocument): boolean => doc.pages.length > 1

// ルートの正規化: 先頭 /、空白は -、連続 / は 1 つ、末尾 / は除去(ルート "/" は残す)
export function normalizeRoute(input: string): string {
  let r = input.trim().replace(/\s+/g, '-')
  if (!r.startsWith('/')) r = '/' + r
  r = r.replace(/\/{2,}/g, '/')
  if (r.length > 1 && r.endsWith('/')) r = r.slice(0, -1)
  return r
}

export type RouteError = 'invalid' | 'duplicate'

// pageId は自分自身を重複判定から除くため(新規は undefined)
export function validateRoute(
  doc: UIDocument,
  pageId: Id | undefined,
  input: string,
): RouteError | null {
  const r = normalizeRoute(input)
  if (/[?#\\]/.test(r)) return 'invalid'
  if (doc.pages.some((p) => p.id !== pageId && p.route === r)) return 'duplicate'
  return null
}

function uniqueRoute(doc: UIDocument, base: string): string {
  const used = new Set(doc.pages.map((p) => p.route))
  if (!used.has(base)) return base
  for (let n = 2; ; n++) {
    const r = `${base}-${n}`
    if (!used.has(r)) return r
  }
}

function uniqueName(doc: UIDocument, base: string): string {
  const used = new Set(doc.pages.map((p) => p.name))
  if (!used.has(base)) return base
  for (let n = 2; ; n++) {
    const s = `${base} ${n}`
    if (!used.has(s)) return s
  }
}

// 新規ページ(まだドキュメントには入れない。createAddPageCommand で追加する)
export function createPageFor(doc: UIDocument): Page {
  let n = doc.pages.length + 1
  const names = new Set(doc.pages.map((p) => p.name))
  while (names.has(`Page ${n}`)) n++
  return createPage(`Page ${n}`, uniqueRoute(doc, `/page-${n}`))
}

// 複製(ノード ID は保持。ページ内スコープなので内部参照が壊れない)
export function duplicatePage(doc: UIDocument, pageId: Id): Page {
  const src = doc.pages.find((p) => p.id === pageId)
  if (!src) throw new Error(`page not found: ${pageId}`)
  const copy = structuredClone(src)
  copy.id = newId()
  copy.name = uniqueName(doc, `${src.name} copy`)
  copy.route = uniqueRoute(doc, src.route === '/' ? '/copy' : `${src.route}-copy`)
  return copy
}

function indexOfPage(d: UIDocument, pageId: Id): number {
  const i = d.pages.findIndex((p) => p.id === pageId)
  if (i < 0) throw new Error(`page not found: ${pageId}`)
  return i
}

export const createAddPageCommand = (page: Page, index?: number): Command => ({
  name: 'add page',
  apply: (d) => {
    const i = index === undefined ? d.pages.length : Math.max(0, Math.min(index, d.pages.length))
    // immer の freeze が呼び出し側の値に及ばないよう複製
    d.pages.splice(i, 0, structuredClone(page))
  },
})

export const createRemovePageCommand = (pageId: Id): Command => ({
  name: 'remove page',
  apply: (d) => {
    if (d.pages.length <= 1) throw new Error('最後のページは削除できません')
    d.pages.splice(indexOfPage(d, pageId), 1)
    d.variables = d.variables.filter((v) => !(v.scope === 'page' && v.ownerId === pageId))
    if (d.project.homePageId === pageId) delete d.project.homePageId
  },
})

export const createMovePageCommand = (pageId: Id, toIndex: number): Command => ({
  name: 'move page',
  apply: (d) => {
    const [p] = d.pages.splice(indexOfPage(d, pageId), 1)
    if (!p) return
    d.pages.splice(Math.max(0, Math.min(toIndex, d.pages.length)), 0, p)
  },
})

export const createRenamePageCommand = (pageId: Id, name: string): Command => ({
  name: 'rename page',
  apply: (d) => {
    const n = name.trim()
    if (!n) throw new Error('ページ名が空です')
    d.pages[indexOfPage(d, pageId)]!.name = n
  },
})

export const createSetRouteCommand = (pageId: Id, route: string): Command => ({
  name: 'set route',
  apply: (d) => {
    const err = validateRoute(d, pageId, route)
    if (err) throw new Error(`route ${err}: ${route}`)
    d.pages[indexOfPage(d, pageId)]!.route = normalizeRoute(route)
  },
})

export const createSetHomePageCommand = (pageId: Id): Command => ({
  name: 'set home page',
  apply: (d) => {
    indexOfPage(d, pageId)
    d.project.homePageId = pageId
  },
})
