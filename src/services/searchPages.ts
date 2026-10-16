import { computed, ref, shallowRef } from 'vue'
import { parseSearchQuery } from '../utils/searchQuery.ts'

export type SearchSort = 'relevance' | 'modified'
export interface SearchMatch {
  title: string; path: string; objectType: string
  matchKind: 'title' | 'body' | 'ocr' | 'annotation' | 'related' | 'tag' | 'slide-title' | 'object' | 'notes'
  context: string; score: number; extractionFailed: boolean
  page?: number; annotationId?: string; locatorKind?: string; locatorObjectId?: string; locationLabel?: string
}
export interface SearchFile {
  path: string; title: string; matches: SearchMatch[]; modifiedAtMs?: number | null
  mayHaveMoreMatches: boolean; locationLimitPerKind: number; unlocatedLimitPerKind: number
  libraryRoot?: string; libraryName?: string
}
export interface LibraryProgress {
  libraryName: string; libraryRoot: string
  state: 'queued' | 'searching' | 'preparing' | 'ready' | 'limited' | 'unavailable' | 'changed'
  availableFiles: number; totalFiles: number | null; examinedSources: number; indexed: boolean; warnings: string[]
}
interface NativePage {
  sessionId: string; snapshotId: string | null; files: SearchFile[]; pageOffset: number | null
  nextCursor: string | null; continueCursor?: string | null; refreshCursor?: string
  scanState: 'preparing' | 'ready' | 'limited' | 'failed'; scanComplete: boolean
  totalFiles: number | null; availableFiles?: number; warnings?: string[]; libraries?: LibraryProgress[]
}
export interface SearchDefinition {
  libraryRoot: string | null; query: string; sort: SearchSort
  channel: 'library' | 'palette'; kind: 'single' | 'libraries'; matchMode?: 'content' | 'tag'
}
export interface SearchFrame extends NativePage { workCursor: string | null; pageCursor: string | null }
export type SearchInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>
type Action = { kind: 'first' | 'work' | 'page'; cursor: string | null }

const publicErrors: Record<string, string> = {
  expired: '搜索现场已变化或过期，请重新搜索；已加载结果和草稿仍保留。',
  snapshotChanged: '可用结果的排序已更新，请刷新结果；不会把新页混入旧列表。',
  busy: '当前搜索任务较多，请稍后重试；已加载结果仍可使用。',
  scopeUnavailable: '请选择已配置且可访问的资料库，再重新搜索。',
  scopeTooLarge: '一次最多搜索 32 个资料库，请切换到当前资料库或缩小范围。',
  requestMismatch: '搜索条件或资料库范围已改变，请重新搜索；没有混入另一查询。',
  invalidCursor: '续载位置已失效，请重新搜索；已加载结果仍保留。',
}

// The two UI entrypoints share cursor ownership and retry rules. No file writes,
// editor state, or results in localStorage; native sessions are explicitly retired.
export function createSearchPages(invoke: SearchInvoke, options: { pageSize?: number; autoMs?: number; pollMs?: number } = {}) {
  const files = shallowRef<SearchFile[]>([]), status = shallowRef<SearchFrame | null>(null)
  const pendingView = shallowRef<SearchFrame | null>(null), busy = ref(false)
  const error = ref(''), errorCode = ref(''), nextPage = ref<string | null>(null)
  let definition: SearchDefinition | null = null, generation = 0, sessionId = '', viewId: string | null = null
  let lastAction: Action = { kind: 'first', cursor: null }, disposed = false
  let wake: (() => void) | undefined
  const initialLoading = computed(() => busy.value && !files.value.length)
  const canContinue = computed(() => !!status.value?.workCursor && !pendingView.value)
  const hasMore = computed(() => !!nextPage.value || !!status.value?.workCursor || !!pendingView.value)
  const closeSession = (id: string, channel: SearchDefinition['channel']) => {
    if (id) void invoke('close_knowledge_search', { sessionId: id, channel }).catch(() => {})
  }
  const retire = () => {
    ++generation; wake?.(); wake = undefined
    if (definition) closeSession(sessionId, definition.channel)
    sessionId = ''; busy.value = false
  }
  const reset = () => {
    retire(); definition = null; files.value = []; status.value = null; pendingView.value = null
    error.value = ''; errorCode.value = ''; viewId = null; nextPage.value = null
  }
  const pause = () => new Promise<void>(resolve => {
    const timer = setTimeout(() => { wake = undefined; resolve() }, options.pollMs ?? 180)
    wake = () => { clearTimeout(timer); resolve() }
  })
  const accept = (frame: SearchFrame) => {
    files.value = frame.files; viewId = frame.snapshotId; nextPage.value = frame.pageCursor
    pendingView.value = null
  }
  const normalize = (raw: NativePage, def: SearchDefinition): SearchFrame => {
    if (!raw || !raw.sessionId || !Array.isArray(raw.files) || raw.files.some(file => !file.path || !file.matches?.length)
      || !['preparing', 'ready', 'limited', 'failed'].includes(raw.scanState)) throw Error('invalid search response')
    return { ...raw,
      files: raw.files.map(file => ({ ...file, libraryRoot: file.libraryRoot || def.libraryRoot || undefined })),
      workCursor: def.kind === 'libraries' ? raw.continueCursor || null : raw.scanState === 'preparing' ? raw.nextCursor : null,
      pageCursor: def.kind === 'single' && raw.scanState === 'preparing' ? null : raw.nextCursor,
    }
  }
  const request = async (action: Action, token: number, forceView = false) => {
    const def = definition!
    lastAction = action
    const raw = await invoke<NativePage>(def.kind === 'single' ? 'search_knowledge_page' : 'search_knowledge_libraries_page', {
      request: { libraryRoot: def.libraryRoot, query: def.query, sort: def.sort, pageSize: options.pageSize ?? 40,
        channel: def.channel, cursor: action.cursor, ...(def.kind === 'single' ? { matchMode: def.matchMode || 'content' } : {}) },
    })
    if (token !== generation || disposed) { if (raw?.sessionId !== sessionId) closeSession(raw?.sessionId, def.channel); return false }
    let frame: SearchFrame
    try { frame = normalize(raw, def) }
    catch (cause) { if (raw?.sessionId !== sessionId) closeSession(raw?.sessionId, def.channel); throw cause }
    sessionId = frame.sessionId
    if (action.kind === 'page') {
      if (frame.snapshotId !== viewId || frame.pageOffset !== files.value.length) throw { code: 'snapshotChanged' }
      const paths = new Set(files.value.map(file => file.path))
      if (frame.files.some(file => paths.has(file.path))) throw { code: 'invalidCursor' }
      files.value = [...files.value, ...frame.files]; nextPage.value = frame.pageCursor
      // Do not rewind newer work progress by applying an older frozen page.
      if (!status.value || status.value.snapshotId === frame.snapshotId) status.value = frame
    } else {
      status.value = frame
      if (forceView || !files.value.length) accept(frame)
      else if (frame.snapshotId !== viewId) pendingView.value = frame
      // Same view work response always starts at zero: keep the loaded page end.
    }
    return true
  }
  const fail = (cause: unknown) => {
    const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : 'unavailable'
    errorCode.value = code
    error.value = publicErrors[code] || '暂时无法读取搜索结果，请重试或检查资料库是否可访问；不是没有匹配。'
  }
  const perform = async (action: Action, forceView = false, loadUntil = 0) => {
    if (!definition || busy.value || disposed) return
    const token = generation, deadline = Date.now() + (options.autoMs ?? 8000)
    busy.value = true; error.value = ''; errorCode.value = ''
    try {
      if (!await request(action, token, forceView)) return
      // Cooperative bounded preparation; healthy old files stay usable. A new
      // ranked view waits for explicit approval instead of moving the selection.
      for (let steps = 0; steps < 48 && token === generation && !pendingView.value && status.value?.workCursor && Date.now() < deadline; steps++) {
        await pause(); if (token !== generation || disposed) return
        if (!await request({ kind: 'work', cursor: status.value.workCursor }, token)) return
      }
      for (let pages = 0; pages < 250 && token === generation && !pendingView.value && nextPage.value && files.value.length < loadUntil && Date.now() < deadline; pages++) {
        if (!await request({ kind: 'page', cursor: nextPage.value }, token)) return
      }
    } catch (cause) { if (token === generation && !disposed) fail(cause) }
    finally { if (token === generation) busy.value = false }
  }
  const start = async (def: SearchDefinition, settings: { preserve?: boolean; loadUntil?: number } = {}) => {
    retire(); if (disposed) return
    definition = { ...def }; pendingView.value = null; nextPage.value = null; status.value = null
    error.value = ''; errorCode.value = ''; viewId = null
    if (!settings.preserve) files.value = []
    try { parseSearchQuery(def.query) } catch (cause) {
      error.value = String(cause).replace(/^Error:\s*/, ''); errorCode.value = 'invalidRequest'; return
    }
    if (!def.query.trim()) return
    if (def.kind === 'single' && !def.libraryRoot) { errorCode.value = 'scopeUnavailable'; error.value = publicErrors.scopeUnavailable; return }
    await perform({ kind: 'first', cursor: null }, true, Math.min(10000, Math.max(0, settings.loadUntil || 0)))
  }
  const applyPending = async () => {
    if (!pendingView.value || busy.value) return
    accept(pendingView.value)
  }
  const restart = () => definition ? start(definition, { preserve: true, loadUntil: files.value.length }) : Promise.resolve()
  const retry = () => ['expired', 'invalidCursor', 'requestMismatch', 'invalidRequest'].includes(errorCode.value) ? restart() : perform(lastAction)
  const refreshAvailable = async () => {
    const cursor = status.value?.refreshCursor
    if (!cursor) { await restart(); return }
    await perform({ kind: 'work', cursor }); await applyPending()
  }
  return { files, status, pendingView, busy, error, errorCode, nextPage, initialLoading, canContinue, hasMore,
    start, reset, restart, retry, applyPending, refreshAvailable,
    loadMore: () => nextPage.value && !pendingView.value ? perform({ kind: 'page', cursor: nextPage.value }) : Promise.resolve(),
    continueSearch: () => status.value?.workCursor ? perform({ kind: 'work', cursor: status.value.workCursor }) : Promise.resolve(),
    dispose: () => { reset(); disposed = true },
  }
}
export type SearchPages = ReturnType<typeof createSearchPages>
