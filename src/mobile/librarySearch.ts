import { codeFileInfo, mobileTextPattern } from './codeFormats.ts'
import type { Document, Storage } from './storage'

export type SearchField = 'all' | 'content' | 'path'
export interface SearchIssue { path: string; message: string }
export interface SearchStatus {
  rootId: string; phase: 'idle' | 'loading' | 'ready' | 'partial' | 'unavailable'
  scope: 'paths' | 'content'
  indexed: number; attempted: number; folders: number; bytes: number; issueCount: number
  issues: SearchIssue[]; finished: number; stale: boolean
}
export interface Excerpt { before: string; hit: string; after: string }
export interface SearchHit {
  rootId: string; relativePath: string; signature: string | null
  pathMatch: boolean; contentMatch: boolean; pathExcerpt: Excerpt; excerpt: Excerpt | null
  codeExcerpt?: Excerpt
}
export interface SearchResults { hits: SearchHit[]; total: number }
export const SEARCH_LIMITS = { files: 1000, folders: 200, depth: 16, bytes: 24 * 1024 * 1024, fileBytes: 4 * 1024 * 1024, results: 100 }
const initial = (rootId: string): SearchStatus => ({ rootId, phase: 'idle', scope: 'content', indexed: 0, attempted: 0, folders: 0, bytes: 0, issueCount: 0, issues: [], finished: 0, stale: false })
const message = (error: unknown) => String(error).replace(/^Error: /, '').replace(/^[A-Z_]+:\s*/, '')
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const excerpt = (text: string, match: RegExpExecArray | null, radius = 48, preserveWhitespace = false): Excerpt => {
  if (!match) return { before: text, hit: '', after: '' }
  const start = Math.max(0, match.index - radius), end = Math.min(text.length, match.index + match[0].length + radius)
  const tidy = (value: string) => preserveWhitespace ? value : value.replace(/\s+/g, ' ')
  return { before: (start ? '…' : '') + tidy(text.slice(start, match.index)), hit: tidy(match[0]), after: tidy(text.slice(match.index + match[0].length, end)) + (end < text.length ? '…' : '') }
}

/** A bounded, memory-only snapshot of saved text, scoped to one authorized root.
 * Every refresh rereads bytes, including files whose provider timestamp did not change.
 * One awaited IO at a time lets saves and private drafts use the native serial queue.
 */
export class LibrarySearchIndex {
  private documents: Document[] = []
  private generation = 0
  private queryGeneration = 0
  private ordered: Document[] | null = null
  private publish: (status: SearchStatus) => void
  private limits: typeof SEARCH_LIMITS
  status: SearchStatus
  constructor(rootId: string, publish: (status: SearchStatus) => void = () => {}, limits = SEARCH_LIMITS) { this.status = initial(rootId); this.publish = publish; this.limits = limits }
  private notify() { this.publish({ ...this.status, issues: [...this.status.issues] }) }
  reset(rootId: string) { this.generation++; this.cancelSearch(); this.documents = []; this.ordered = null; this.status = initial(rootId); this.notify() }
  private issue(path: string, detail: string) {
    this.status.issueCount++
    if (this.status.issues.length < 20) this.status.issues.push({ path: path || '资料库根目录', message: detail })
  }
  private unavailable(detail: string) {
    this.generation++; this.cancelSearch(); this.documents = []; this.ordered = null; this.status = { ...initial(this.status.rootId), phase: 'unavailable' }
    this.issue('', detail); this.notify()
  }
  async verifyAccess(storage: Pick<Storage, 'roots'>): Promise<boolean> {
    const owner = this.generation, rootId = this.status.rootId
    try {
      const root = (await storage.roots()).find(item => item.id === rootId)
      if (owner !== this.generation) return false
      if (!root?.available) { this.unavailable('这个资料库暂时无法访问，请重新授权或稍后重试。'); return false }
      if (this.status.phase === 'unavailable') this.reset(rootId)
      return true
    } catch (error) { if (owner === this.generation) this.unavailable(message(error)); return false }
  }
  stop() {
    if (this.status.phase !== 'loading') return
    this.generation++; this.issue('', '已停止读取，结果仅包含已经读完的文件。')
    this.status.phase = 'partial'; this.status.finished = Date.now(); this.notify()
  }
  markStale() { if (this.status.phase === 'loading') this.stop(); if (this.status.finished) { this.status.stale = true; this.notify() } }
  async build(storage: Pick<Storage, 'roots' | 'list' | 'read'>, scope: 'paths' | 'content' = 'content') {
    const rootId = this.status.rootId
    this.reset(rootId)
    this.status.phase = 'loading'; this.status.scope = scope; this.notify()
    const owner = this.generation, current = () => owner === this.generation
    if (!await this.verifyAccess(storage) || !current()) return
    const folders = [{ path: '', depth: 0 }], seen = new Set<string>()
    let directories = 1, budgetReached = false
    while (folders.length && current() && !budgetReached) {
      const folder = folders.shift()!
      try {
        const listing = await storage.list(rootId, folder.path)
        if (!current()) return
        this.status.folders++
        if (listing.truncated) this.issue(folder.path, '此目录只读取前 1,000 项，其余文件未纳入。')
        const names = new Map<string, number>()
        for (const entry of listing.entries) names.set(entry.name, (names.get(entry.name) || 0) + 1)
        for (const entry of listing.entries) {
          if (!current()) return
          // Providers are untrusted. Never follow a returned absolute, parent or sibling path.
          if (!entry.name || /[\/\\\0]/.test(entry.name) || entry.name === '.' || entry.name === '..' || entry.relativePath !== [folder.path, entry.name].filter(Boolean).join('/')) {
            this.issue(folder.path, '提供器返回了无效位置，该条目已跳过。'); continue
          }
          if (entry.name.startsWith('.')) continue
          if ((names.get(entry.name) || 0) > 1) { this.issue(entry.relativePath, '同名条目无法唯一定位，该条目未纳入。'); continue }
          if (seen.has(entry.relativePath)) { this.issue(entry.relativePath, '同名条目无法唯一定位，已跳过重复项。'); continue }
          seen.add(entry.relativePath)
          if (entry.directory) {
            if (folder.depth >= this.limits.depth || directories >= this.limits.folders) this.issue(entry.relativePath, '已达到文件夹数量或层数上限，此文件夹未读取。')
            else { folders.push({ path: entry.relativePath, depth: folder.depth + 1 }); directories++ }
            continue
          }
          if (!mobileTextPattern.test(entry.name)) continue
          if (this.status.attempted >= this.limits.files) { this.issue(entry.relativePath, `本次最多读取 ${this.limits.files} 份文档，其余文件未纳入。`); budgetReached = true; break }
          this.status.attempted++
          if (scope === 'paths') {
            this.documents.push({ rootId, relativePath: entry.relativePath, content: '', signature: null, modified: entry.modified })
            this.ordered = null; this.status.indexed++
            if (this.status.attempted % 32 === 0) { this.notify(); await new Promise<void>(resolve => setTimeout(resolve, 0)) }
            continue
          }
          if (entry.size > this.limits.fileBytes) { this.issue(entry.relativePath, '超过单文件 4 MiB 的读取上限。'); continue }
          try {
            const document = await storage.read({ rootId, relativePath: entry.relativePath })
            if (!current()) return
            if (document.rootId !== rootId || document.relativePath !== entry.relativePath) throw new Error('文件身份不一致，该文件未纳入。')
            const bytes = new TextEncoder().encode(document.content).length
            if (bytes > this.limits.fileBytes) { this.issue(entry.relativePath, '超过单文件 4 MiB 的读取上限。'); continue }
            if (this.status.bytes + bytes > this.limits.bytes) { this.issue(entry.relativePath, '已达到本次文本容量上限，其余文件未纳入。'); budgetReached = true; break }
            this.documents.push(document); this.ordered = null; this.status.indexed++; this.status.bytes += bytes
          } catch (error) {
            if (!current()) return
            if (/PERMISSION:/.test(String(error))) { this.unavailable(message(error)); return }
            this.issue(entry.relativePath, message(error))
          }
          this.notify()
          if (this.status.attempted % 5 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0))
        }
      } catch (error) {
        if (!current()) return
        if (/PERMISSION:/.test(String(error))) { this.unavailable(message(error)); return }
        this.issue(folder.path, message(error))
      }
      this.notify()
    }
    if (!current() || !await this.verifyAccess(storage) || !current()) return
    this.status.phase = this.status.issueCount ? 'partial' : 'ready'; this.status.finished = Date.now(); this.notify()
  }
  private *scan(query: string, field: SearchField): Generator<SearchHit | null> {
    query = query.trim()
    if (!query || query.length > 128 || !['ready', 'partial'].includes(this.status.phase) || (this.status.scope === 'paths' && field !== 'path')) return
    const pattern = new RegExp(escaped(query), 'iu')
    // Stable path order, with name/path matches first. Count all matches; bound rendered rows.
    const documents = this.ordered ||= [...this.documents].sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-CN'))
    for (const pathPriority of [true, false]) for (const document of documents) {
      const pathMatch = field === 'content' ? null : pattern.exec(document.relativePath)
      if (!!pathMatch !== pathPriority) { yield null; continue }
      const contentMatch = field === 'path' ? null : pattern.exec(document.content)
      if (!pathMatch && !contentMatch) { yield null; continue }
      yield { rootId: document.rootId, relativePath: document.relativePath, signature: document.signature,
        pathMatch: !!pathMatch, contentMatch: !!contentMatch, pathExcerpt: excerpt(document.relativePath, pathMatch), excerpt: contentMatch ? excerpt(document.content, contentMatch) : null,
        ...(contentMatch && codeFileInfo(document.relativePath) ? {codeExcerpt:excerpt(document.content,contentMatch,96,true)} : {}) }
    }
  }
  search(query: string, field: SearchField = 'all'): SearchResults {
    const result: SearchResults = { hits: [], total: 0 }
    for (const hit of this.scan(query, field)) if (hit) { result.total++; if (result.hits.length < this.limits.results) result.hits.push(hit) }
    return result
  }
  cancelSearch() { this.queryGeneration++ }
  async searchAsync(query: string, field: SearchField = 'all', signal?: AbortSignal): Promise<SearchResults | null> {
    const owner = ++this.queryGeneration, generation = this.generation
    const current = () => owner === this.queryGeneration && generation === this.generation && !signal?.aborted
    const result: SearchResults = { hits: [], total: 0 }
    let scanned = 0, started = performance.now()
    for (const hit of this.scan(query, field)) {
      if (!current()) return null
      if (hit) { result.total++; if (result.hits.length < this.limits.results) result.hits.push(hit) }
      if (++scanned % 64 === 0 || performance.now() - started >= 8) {
        await new Promise<void>(resolve => setTimeout(resolve, 0)); started = performance.now()
      }
    }
    return current() ? result : null
  }
}
