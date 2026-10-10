import { createRegistry } from './registry'
import type { Emitter, Importer, Provider } from './types'

export { createRegistry } from './registry'
export type { Registry } from './registry'
export * from './types'

export const importerRegistry = createRegistry<Importer>('importer')
export const emitterRegistry = createRegistry<Emitter>('emitter')
export const providerRegistry = createRegistry<Provider>('provider')

export const registerImporter = (i: Importer) => importerRegistry.register(i)
export const registerEmitter = (e: Emitter) => emitterRegistry.register(e)
export const registerProvider = (p: Provider) => providerRegistry.register(p)
