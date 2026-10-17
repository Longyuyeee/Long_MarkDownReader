import { reactive } from 'vue'
interface Preferences {
  pinnedTags: string[]
  tagSort: 'name' | 'count'
  collectionOrder: string[]
  resultViews: Record<string, { sort: 'name' | 'path' | 'modified' | 'relevance'; scroll: number }>
}
const cache = new Map<string, Preferences>()
const key = (root: string) => 'longedit.library-navigation.v1:' + root.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
export function libraryNavigationPreferences(root: string) {
  const identity = key(root)
  if (!cache.has(identity)) {
    let saved: Partial<Preferences> = {}
    try { saved = JSON.parse(localStorage.getItem(identity) || '{}') || {} } catch { /* Keep browsing available. */ }
    cache.set(identity, reactive({
      pinnedTags: Array.isArray(saved.pinnedTags) ? saved.pinnedTags.filter(item => typeof item === 'string').slice(0, 100) : [],
      tagSort: saved.tagSort === 'count' ? 'count' : 'name',
      collectionOrder: Array.isArray(saved.collectionOrder) ? saved.collectionOrder.filter(item => typeof item === 'string').slice(0, 64) : [],
      resultViews: saved.resultViews && typeof saved.resultViews === 'object' ? saved.resultViews : {},
    }))
  }
  return cache.get(identity)!
}
export function updateLibraryNavigation(root: string, patch: Partial<Preferences>) {
  const preferences = libraryNavigationPreferences(root)
  Object.assign(preferences, patch)
  try { localStorage.setItem(key(root), JSON.stringify(preferences)) } catch { /* A full disk must not block navigation. */ }
}
export const splitFilterTags = (value: string) => [...new Set(value.split(/[\s,，]+/).map(tag => tag.replace(/^#+/, '')).filter(Boolean))]
