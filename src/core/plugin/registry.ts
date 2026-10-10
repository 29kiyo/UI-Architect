export type Registry<T extends { id: string }> = {
  register(item: T): void // 重複 ID は throw
  get(id: string): T | undefined
  list(): T[]
  unregister(id: string): boolean
}

export function createRegistry<T extends { id: string }>(kind: string): Registry<T> {
  const map = new Map<string, T>()
  return {
    register(item) {
      if (map.has(item.id)) throw new Error(`${kind} already registered: ${item.id}`)
      map.set(item.id, item)
    },
    get: (id) => map.get(id),
    list: () => [...map.values()],
    unregister: (id) => map.delete(id),
  }
}
