import type { Id, MockCollection, UIDocument, Variable } from '../model'

// immer の recipe 内(Command の apply)で呼ぶ。不正操作は throw。

export function addVariable(doc: UIDocument, v: Variable): void {
  if (doc.variables.some((x) => x.id === v.id)) throw new Error(`variable exists: ${v.id}`)
  if (
    doc.variables.some((x) => x.name === v.name && x.scope === v.scope && x.ownerId === v.ownerId)
  ) {
    throw new Error(`variable name exists: ${v.name}`)
  }
  doc.variables.push(v)
}

export function removeVariable(doc: UIDocument, id: Id): void {
  const i = doc.variables.findIndex((v) => v.id === id)
  if (i < 0) throw new Error(`variable not found: ${id}`)
  doc.variables.splice(i, 1)
}

export function upsertMockCollection(doc: UIDocument, c: MockCollection): void {
  const i = doc.mockData.findIndex((x) => x.id === c.id)
  if (i < 0) doc.mockData.push(c)
  else doc.mockData[i] = c
}

export function removeMockCollection(doc: UIDocument, id: Id): void {
  const i = doc.mockData.findIndex((c) => c.id === id)
  if (i < 0) throw new Error(`mock collection not found: ${id}`)
  doc.mockData.splice(i, 1)
}
