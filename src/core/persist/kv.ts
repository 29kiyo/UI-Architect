// 文字列だけを保存する最小の非同期ストア(自動保存・スナップショット用)
export type KeyValueStore = {
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
}

export function createMemoryKv(): KeyValueStore {
  const map = new Map<string, string>()
  return {
    get: async (key) => map.get(key),
    set: async (key, value) => {
      map.set(key, value)
    },
    delete: async (key) => {
      map.delete(key)
    },
    keys: async () => [...map.keys()],
  }
}

export function createIndexedDbKv(dbName = 'ui-architect', storeName = 'kv'): KeyValueStore {
  let dbPromise: Promise<IDBDatabase> | undefined

  const open = (): Promise<IDBDatabase> => {
    dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(storeName)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }).catch((err) => {
      dbPromise = undefined // 次回やり直せるようにする
      throw err
    })
    return dbPromise
  }

  async function run<T>(
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode)
      const req = fn(tx.objectStore(storeName))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  return {
    get: async (key) => (await run('readonly', (s) => s.get(key))) as string | undefined,
    set: async (key, value) => {
      await run('readwrite', (s) => s.put(value, key))
    },
    delete: async (key) => {
      await run('readwrite', (s) => s.delete(key))
    },
    keys: async () => (await run('readonly', (s) => s.getAllKeys())).map(String),
  }
}
