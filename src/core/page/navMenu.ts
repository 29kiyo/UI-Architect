import type { Command } from '../history'
import { addVariable } from '../data'
import { editablePages } from '../master'
import { createNode, type Id, type UIDocument } from '../model'
import { addNode, getParentId, requireNode } from '../store'
import { setOverrideHidden } from '../device'

export type NavMenuIds = { buttonId: Id; variableId: Id; eventId: Id }

// 既存の変数名と重複しない menuOpen / menuOpen2 ...
export function uniqueMenuVarName(doc: UIDocument): string {
  const used = new Set(doc.variables.map((v) => v.name))
  if (!used.has('menuOpen')) return 'menuOpen'
  for (let n = 2; ; n++) if (!used.has(`menuOpen${n}`)) return `menuOpen${n}`
}

// 生成できない理由(できるなら null)
export function navMenuBlocker(
  doc: UIDocument,
  pageId: Id,
  navId: Id,
  mobileDeviceId: Id,
): 'missing' | 'not-nav' | 'exists' | 'base-device' | 'no-parent' | null {
  const page = editablePages(doc).find((p) => p.id === pageId)
  const nav = page?.nodes[navId]
  if (!page || !nav) return 'missing'
  if (nav.category !== 'nav') return 'not-nav'
  if (typeof nav.props.custom.mobileMenu === 'string') return 'exists'
  if (doc.devices[0]?.id === mobileDeviceId) return 'base-device'
  if (!getParentId(page, navId)) return 'no-parent'
  return null
}

export const createMobileMenuCommand = (o: {
  pageId: Id
  navId: Id
  mobileDeviceId: Id
  ids: NavMenuIds
}): Command => ({
  name: 'make mobile menu',
  apply: (d) => {
    const why = navMenuBlocker(d, o.pageId, o.navId, o.mobileDeviceId)
    if (why) throw new Error(`mobile menu: ${why}`)
    const page = editablePages(d).find((p) => p.id === o.pageId)!
    const nav = requireNode(page, o.navId)
    const parentId = getParentId(page, o.navId)!
    const name = uniqueMenuVarName(d)
    const isPage = d.pages.some((p) => p.id === o.pageId)

    addVariable(d, {
      id: o.ids.variableId,
      name,
      scope: isPage ? 'page' : 'global',
      ...(isPage ? { ownerId: o.pageId } : {}),
      type: 'boolean',
      initial: false,
    })

    const button = createNode({
      id: o.ids.buttonId,
      type: 'element',
      category: 'button',
      name: 'Menu button',
      hidden: true, // 共有では非表示。スマホだけ表示する
      events: [
        {
          id: o.ids.eventId,
          trigger: 'click',
          actions: [{ type: 'toggle', variable: name }],
        },
      ],
    })
    button.props.content = { text: '☰' }
    const index = page.nodes[parentId]!.children.indexOf(o.navId)
    addNode(page, button, parentId, index)

    setOverrideHidden(page, o.mobileDeviceId, o.ids.buttonId, false)
    setOverrideHidden(page, o.mobileDeviceId, o.navId, true)
    nav.props.custom.mobileMenu = name
  },
})
