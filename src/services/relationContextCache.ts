const MAX_CONTEXT_CACHE_ENTRIES = 32
const CONTEXT_CACHE_TTL_MS = 30_000

interface CacheEntry {
  expiresAt: number
  value: unknown
}

const cache = new Map<string, CacheEntry>()
const normalize = (value: string) => value.replace(/^\\\\\?\\/, '').replace(/\\/g, '/').toLowerCase()
const keyFor = (libraryRoot: string, path: string, scope: string) => `${scope}:${normalize(libraryRoot)}:${normalize(path)}`

export const getRelationContextCache = <T>(libraryRoot: string, path: string, scope = 'context'): T | undefined => {
  const key = keyFor(libraryRoot, path, scope)
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return undefined
  }
  cache.delete(key)
  cache.set(key, entry)
  return entry.value as T
}

export const setRelationContextCache = <T>(libraryRoot: string, path: string, value: T, scope = 'context') => {
  const key = keyFor(libraryRoot, path, scope)
  cache.delete(key)
  cache.set(key, { expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS, value })
  while (cache.size > MAX_CONTEXT_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (typeof oldest !== 'string') break
    cache.delete(oldest)
  }
}

export const clearRelationContextCache = (libraryRoot: string, path: string) => {
  const suffix = `:${normalize(libraryRoot)}:${normalize(path)}`
  for (const key of cache.keys()) {
    if (key.endsWith(suffix)) cache.delete(key)
  }
}
