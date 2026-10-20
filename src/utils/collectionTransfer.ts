import type { SavedSearchConfig } from '../store/app'

export type PortableCollection = Pick<SavedSearchConfig, 'name' | 'query' | 'objectTypes' | 'filters' | 'graphRoot' | 'graphDepth'>
export interface CollectionBundle { kind: 'longedit-collections'; schemaVersion: 1; collections: PortableCollection[] }
export const portableCollection = (entry: PortableCollection): PortableCollection => ({
  name: entry.name, query: entry.query, objectTypes: [...entry.objectTypes],
  ...(entry.filters ? { filters: { ...entry.filters, ...(entry.filters.tags ? { tags: [...entry.filters.tags] } : {}) } } : {}),
  ...(typeof entry.graphRoot === 'string' || typeof entry.graphDepth === 'number'
    ? { graphRoot: typeof entry.graphRoot === 'string' ? entry.graphRoot : '', graphDepth: entry.graphDepth ?? undefined } : {}),
})
export function planCollectionNames(entries: PortableCollection[], existingNames: string[]): PortableCollection[] {
  const used = new Set(existingNames.map(name => name.trim().toLocaleLowerCase()))
  return entries.map(entry => {
    const base = entry.name.trim() || '导入的集合'
    let name = base, index = 1
    while (used.has(name.toLocaleLowerCase())) {
      const suffix = `（导入 ${index++}）`
      name = Array.from(base).slice(0, 80 - Array.from(suffix).length).join('') + suffix
    }
    used.add(name.toLocaleLowerCase())
    return { ...portableCollection(entry), name }
  })
}
