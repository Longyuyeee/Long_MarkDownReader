/** Navigation metadata only. Drafts and document contents belong to DocumentSession. */
export type MobileRoot = 'library' | 'search' | 'recent' | 'settings'
export interface MobilePage { tab: MobileRoot; rootId: string; folder: string }
export interface MobileViewport { query: string; visibleCount: number; scroll: number; focusKey: string }
export interface MobileOrigin { page: MobilePage; view: MobileViewport }

const fresh = (): MobileViewport => ({ query: '', visibleCount: 80, scroll: 0, focusKey: '' })
const pageKey = (page: MobilePage) => JSON.stringify([page.tab, page.rootId, page.tab === 'library' ? page.folder : ''])
const copy = (origin: MobileOrigin): MobileOrigin => ({ page: { ...origin.page }, view: { ...origin.view } })

/** Bounded, in-memory page history. No paths, queries or transient dialogs are persisted. */
export class MobileViewHistory {
  private pages = new Map<string, MobileOrigin>()
  private folders = new Map<string, string>()
  private limit: number
  constructor(limit = 128) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid page history limit')
    this.limit = limit
  }
  remember(page: MobilePage, view: MobileViewport): MobileOrigin {
    const origin: MobileOrigin = { page: { ...page }, view: {
      query: view.query, focusKey: view.focusKey,
      scroll: Number.isFinite(view.scroll) ? Math.max(0, view.scroll) : 0,
      visibleCount: Number.isFinite(view.visibleCount) ? Math.max(80, Math.min(1000, Math.floor(view.visibleCount))) : 80,
    } }
    const key = pageKey(page)
    this.pages.delete(key); this.pages.set(key, origin)
    if (page.tab === 'library') this.folders.set(page.rootId, page.folder)
    while (this.pages.size > this.limit) this.pages.delete(this.pages.keys().next().value!)
    // Keep the selected-folder lookup bounded along with the page cache.
    for (const rootId of this.folders.keys()) {
      if (![...this.pages.values()].some(entry => entry.page.tab === 'library' && entry.page.rootId === rootId)) this.folders.delete(rootId)
    }
    return copy(origin)
  }
  recall(page: MobilePage): MobileOrigin {
    const key = pageKey(page), existing = this.pages.get(key)
    if (!existing) return { page: { ...page }, view: fresh() }
    this.pages.delete(key); this.pages.set(key, existing)
    return copy(existing)
  }
  /** Reading hidden folder metadata must not select that view as most recent. */
  peek(page: MobilePage): MobileOrigin {
    const existing = this.pages.get(pageKey(page))
    return existing ? copy(existing) : { page: { ...page }, view: fresh() }
  }
  libraryPage(rootId: string): MobilePage { return { tab: 'library', rootId, folder: this.folders.get(rootId) || '' } }
  /** All files and Recent are views of the same root destination. */
  librarySurface(rootId: string): MobilePage {
    const latest = [...this.pages.values()].reverse().find(entry => entry.page.rootId === rootId && (entry.page.tab === 'library' || entry.page.tab === 'recent'))
    return latest?.page.tab === 'recent' ? { ...latest.page } : this.libraryPage(rootId)
  }
  forgetLibrary(rootId: string) {
    for (const [key, origin] of this.pages) if (origin.page.rootId === rootId) this.pages.delete(key)
    this.folders.delete(rootId)
  }
}
