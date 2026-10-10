import { CURRENT_SCHEMA_VERSION, type Device, type Page, type UIDocument } from './document'
import { newId } from './ids'
import { NodeSchema, type Node } from './node'

export function createNode(partial: Partial<Node> & Pick<Node, 'type'>): Node {
  return NodeSchema.parse({
    id: newId(),
    category: 'container',
    name: partial.type,
    props: {},
    ...partial,
  })
}

export function createPage(name = 'Page 1', route = '/'): Page {
  const root = createNode({ type: 'element', name: 'Root' })
  return {
    id: newId(),
    name,
    route,
    rootNodeId: root.id,
    nodes: { [root.id]: root },
    overrides: {},
  }
}

export function createDevice(kind: Device['kind'] = 'pc'): Device {
  const preset = {
    pc: { name: 'PC', width: 1280, height: 800 },
    tablet: { name: 'Tablet', width: 768, height: 1024 },
    mobile: { name: 'Mobile', width: 390, height: 844 },
  }[kind]
  return {
    id: newId(),
    kind,
    ...preset,
    pixelRatio: 1,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    orientation: kind === 'pc' ? 'landscape' : 'portrait',
  }
}

export function createEmptyDocument(name = 'Untitled'): UIDocument {
  const now = Date.now()
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    project: { name, createdAt: now, updatedAt: now },
    devices: [createDevice('pc'), createDevice('mobile')],
    pages: [createPage()],
    assets: [],
    tokens: { colors: {}, spacing: {}, fonts: {} },
    variables: [],
    components: [],
    mockData: [],
  }
}
