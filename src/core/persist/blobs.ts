// アセットのバイナリを保存する非同期ストア(キーは Asset.id)。
// 文字列用の KeyValueStore(kv.ts)とは別 DB にして、既存 DB のバージョンに干渉しない。
export type AssetBlob = { mime: string; data: ArrayBuffer }

export type BlobStore = {
  get(id: string): Promise<AssetBlob | undefined>
  put(id: string, blob: AssetBlob): Promise<void>
  delete(id: string): Promise<void>
  keys(): Promise<string[]>
}

export async function putBlobs(
  store: BlobStore,
  entries: Iterable<readonly [string, AssetBlob]>,
): Promise<void> {
  for (const [id, blob] of entries) await store.put(id, blob)
}

export function createMemoryBlobStore(): BlobStore {
  const map = new Map<string, AssetBlob>()
  return {
    get: async (id) => {
      const b = map.get(id)
      return b ? { mime: b.mime, data: b.data.slice(0) } : undefined
    },
    put: async (id, blob) => {
      map.set(id, { mime: blob.mime, data: blob.data.slice(0) })
    },
    delete: async (id) => {
      map.delete(id)
    },
    keys: async () => [...map.keys()],
  }
}

export function createIndexedDbBlobStore(
  dbName = 'ui-architect-blobs',
  storeName = 'blobs',
): BlobStore {
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
    get: async (id) => (await run('readonly', (s) => s.get(id))) as AssetBlob | undefined,
    put: async (id, blob) => {
      await run('readwrite', (s) => s.put({ mime: blob.mime, data: blob.data }, id))
    },
    delete: async (id) => {
      await run('readwrite', (s) => s.delete(id))
    },
    keys: async () => (await run('readonly', (s) => s.getAllKeys())).map(String),
  }
}
