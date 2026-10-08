import type { Device, Id, Node, Page, UIDocument } from '../model'

export const selectPage = (doc: UIDocument, pageId: Id): Page | undefined =>
  doc.pages.find((p) => p.id === pageId)

export const selectNode = (doc: UIDocument, pageId: Id, nodeId: Id): Node | undefined =>
  selectPage(doc, pageId)?.nodes[nodeId]

export const selectDevice = (doc: UIDocument, deviceId: Id): Device | undefined =>
  doc.devices.find((d) => d.id === deviceId)
