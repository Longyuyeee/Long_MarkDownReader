/** Reading limits are independent of the 4 MiB source read/write limit. */
export const READING_BUDGET = { bytes: 128 * 1024, lines: 2000, line: 16384, html: 384 * 1024, elements: 4000, page: 16384, preparationMs: 2000 } as const
export type DocumentMatch = { from: number; to: number }
export interface DocumentMatches { count: number; current: number; truncated: boolean; pending?: boolean }
export function sourceReadingReason(content: string): string {
  if (new TextEncoder().encode(content).length > READING_BUDGET.bytes) return '文稿较长'
  let lines = 1, start = 0
  for (let i = 0; i < content.length; i++) {
    if (i - start >= READING_BUDGET.line) return '文稿包含较长的行'
    if (content[i] === '\r' || content[i] === '\n') {
      if (content[i] === '\r' && content[i + 1] === '\n') i++
      start = i + 1
      if (++lines > READING_BUDGET.lines) return '文稿行数较多'
    }
  }
  return ''
}
export function previewWithinBudget(html: string): boolean {
  if (html.length > READING_BUDGET.html) return false
  let elements = 0
  for (let i = 0; i < html.length; i++) if (html[i] === '<' && ++elements > READING_BUDGET.elements) return false
  return true
}
export function sourcePages(content: string): DocumentMatch[] {
  const pages: DocumentMatch[] = []
  for (let from = 0; from < content.length;) {
    let to: number = Math.min(content.length, from + READING_BUDGET.page)
    if (to < content.length) {
      const newline = content.lastIndexOf('\n', to - 1)
      if (newline > from + READING_BUDGET.page * .75) to = newline + 1
      if (content[to - 1] === '\r' && content[to] === '\n') to--
      if (/[\uD800-\uDBFF]/.test(content[to - 1]!)) to--
    }
    pages.push({ from, to }); from = to
  }
  return pages.length ? pages : [{ from: 0, to: 0 }]
}
/** Keep accessible text nodes small enough that one offscreen part does not
 * hide the whole page in Android's accessibility tree. Visual whitespace stays exact. */
export function sourceFragments(content: string, range: DocumentMatch, hit: DocumentMatch | null) {
  const fragments: { from: number; before: string; hit: string; after: string }[] = []
  for (let from = range.from; from < range.to;) {
    let to = Math.min(range.to, from + 128), lines = 0
    for (let i = from; i < to; i++) if (content[i] === '\r' || content[i] === '\n') {
      if (content[i] === '\r' && content[i + 1] === '\n') i++
      if (++lines === 8) { to = Math.min(to, i + 1); break }
    }
    if (content[to - 1] === '\r' && content[to] === '\n') to--
    if (to < range.to && /[\uD800-\uDBFF]/.test(content[to - 1]!) && /[\uDC00-\uDFFF]/.test(content[to]!)) to--
    const start = hit ? Math.max(from, hit.from) : to, end = hit ? Math.min(to, hit.to) : to
    fragments.push(end > start ? { from, before: content.slice(from, start), hit: content.slice(start, end), after: content.slice(end, to) } : { from, before: content.slice(from, to), hit: '', after: '' })
    from = to
  }
  return fragments
}
/** Bounded slices retain cross-slice literal matches and non-overlap semantics.
 * A null result means cancellation; it must never be presented as no matches. */
export async function findDocumentMatches(length: number, slice: (from: number, to: number) => string, query: string, signal: AbortSignal): Promise<{ matches: DocumentMatch[]; truncated: boolean } | null> {
  if (signal.aborted) return null
  if (!query || query.length > 128) return { matches: [], truncated: false }
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
  const matches: DocumentMatch[] = []
  let resume = 0
  for (let from = 0; from < length;) {
    if (signal.aborted) return null
    let to = Math.min(length, from + READING_BUDGET.page)
    if (to < length && /[\uD800-\uDBFF]/.test(slice(to - 1, to))) to--
    const text = slice(from, Math.min(length, to + query.length + 1))
    pattern.lastIndex = Math.max(0, resume - from)
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) && match.index < to - from) {
      matches.push({ from: from + match.index, to: from + match.index + match[0].length })
      resume = from + match.index + match[0].length
      if (matches.length === 1000) return signal.aborted ? null : { matches, truncated: true }
    }
    from = to
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
  return signal.aborted ? null : { matches, truncated: false }
}
