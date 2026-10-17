import { computed, ref, shallowRef } from 'vue'
import type { SearchInvoke } from './searchPages.ts'

export interface TagCount { tag: string; count: number }
export interface TagCatalogFrame {
  sessionId: string; nextCursor: string | null; scanState: 'preparing' | 'ready' | 'limited'
  scanComplete: boolean; tags: TagCount[]; examinedNotes: number; totalNotes: number | null
  unreadSources: number; warnings: string[]
}
// Volatile, bounded, per-component query state. No bodies or counts persisted
// as authoritative library data; refresh never labels an old count as current.
export function createTagCatalogPages(invoke: SearchInvoke, options: { autoMs?: number; pollMs?: number } = {}) {
  const tags = shallowRef<TagCount[]>([]), status = shallowRef<TagCatalogFrame | null>(null)
  const pendingStatus = shallowRef<TagCatalogFrame | null>(null), busy = ref(false), error = ref(''), retaining = ref(false)
  let root = '', session = '', cursor: string | null = null, generation = 0, disposed = false, failedCursor: string | null = null
  let wake: (() => void) | undefined
  const close = (id: string) => { if (id) void invoke('close_knowledge_search', { sessionId: id, channel: 'tagCatalog' }).catch(() => {}) }
  const retire = () => { ++generation; wake?.(); wake = undefined; close(session); session = ''; cursor = null; busy.value = false }
  const reset = () => { retire(); root = ''; tags.value = []; status.value = null; pendingStatus.value = null; retaining.value = false; error.value = '' }
  const pause = () => new Promise<void>(resolve => {
    const timer = setTimeout(() => { wake = undefined; resolve() }, options.pollMs ?? 180)
    wake = () => { clearTimeout(timer); resolve() }
  })
  const validate = (frame: TagCatalogFrame) => {
    if (!frame?.sessionId || !['preparing', 'ready', 'limited'].includes(frame.scanState)
      || !Array.isArray(frame.tags) || frame.tags.length > 10000 || new Set(frame.tags.map(tag => tag.tag)).size !== frame.tags.length
      || frame.tags.some(tag => !tag.tag || [...tag.tag].length > 500 || !Number.isSafeInteger(tag.count) || tag.count < 1 || tag.count > frame.examinedNotes)
      || !Number.isSafeInteger(frame.examinedNotes) || frame.examinedNotes < 0 || !Number.isSafeInteger(frame.unreadSources) || frame.unreadSources < 0
      || (frame.scanComplete !== (frame.scanState === 'ready')) || (frame.scanComplete ? frame.totalNotes !== frame.examinedNotes : frame.totalNotes !== null)
      || (frame.scanState === 'preparing' ? typeof frame.nextCursor !== 'string' || !frame.nextCursor || frame.nextCursor.length > 160 : frame.nextCursor !== null)
      || !Array.isArray(frame.warnings)) throw Error('标签统计响应不完整，保留已读取结果')
  }
  const perform = async (startCursor: string | null) => {
    if (!root || busy.value || disposed) return
    const token = generation, requestedRoot = root, deadline = Date.now() + (options.autoMs ?? 8000)
    busy.value = true; error.value = ''
    let next = startCursor
    try {
      for (let steps = 0; steps < 48; steps++) {
        failedCursor = next
        const frame = await invoke<TagCatalogFrame>('get_tag_catalog_page', { request: { libraryRoot: requestedRoot, cursor: next } })
        if (token !== generation || disposed) { if (frame?.sessionId !== session) close(frame?.sessionId); return }
        try { validate(frame) } catch (cause) { if (frame?.sessionId !== session) close(frame?.sessionId); throw cause }
        if (session && frame.sessionId !== session) { close(frame.sessionId); throw Error('统计现场已变化，请刷新；没有混合两个资料库') }
        session = frame.sessionId; cursor = frame.nextCursor
        if (retaining.value && !frame.scanComplete) {
          pendingStatus.value = frame
          if (frame.scanState === 'limited') error.value = '本次统计尚未完成，保留上次标签；数量不是本次全部，请检查提示后刷新。'
        } else {
          tags.value = frame.tags; status.value = frame; pendingStatus.value = null; retaining.value = false
        }
        if (!cursor || Date.now() >= deadline) break
        next = cursor; await pause(); if (token !== generation || disposed) return
      }
    } catch (cause) {
      if (token === generation && !disposed) {
        const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : ''
        if (['expired', 'invalidCursor', 'requestMismatch'].includes(code)) { close(session); session = ''; cursor = null; failedCursor = null }
        error.value = '暂时无法完成标签统计，保留已读取结果；不是没有标签。请重试或核对资料库。'
      }
    } finally { if (token === generation) busy.value = false }
  }
  const start = async (libraryRoot: string) => {
    const preserve = root === libraryRoot && tags.value.length > 0
    retire(); if (disposed) return
    root = libraryRoot; error.value = ''; pendingStatus.value = null; failedCursor = null
    if (!preserve) { tags.value = []; status.value = null }
    retaining.value = preserve
    if (!root) { error.value = '请先选择资料库'; return }
    await perform(null)
  }
  return { tags, status, pendingStatus, busy, retaining, error,
    canContinue: computed(() => Boolean(cursor) && !busy.value),
    start, reset, restart: () => start(root),
    continueScan: () => cursor ? perform(cursor) : Promise.resolve(),
    retry: () => !session ? start(root) : perform(failedCursor),
    dispose: () => { reset(); disposed = true },
  }
}
