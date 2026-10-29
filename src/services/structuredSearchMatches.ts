import { type EditorState, type Text } from '@codemirror/state'
import { getSearchQuery, type SearchQuery } from '@codemirror/search'

export interface SearchMatchPlan {
  doc: Text; query: SearchQuery
  ranges: readonly { from: number; to: number }[]; capped: boolean
}
export function buildSearchMatches(state: EditorState, limit = 10000): { plan?: SearchMatchPlan; message?: string } {
  const query = getSearchQuery(state)
  if (!query.search) return { message: '请输入查找内容' }
  if (!query.valid) return { message: '正则表达式无效' }
  const ranges: { from: number; to: number }[] = [], cursor = query.getCursor(state)
  let capped = false
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    if (ranges.length === limit) { capped = true; break }
    ranges.push({ from: next.value.from, to: next.value.to })
  }
  return { plan: { doc: state.doc, query, ranges: Object.freeze(ranges), capped } }
}
export function searchMatchRows(plan: SearchMatchPlan, page: number, size = 20) {
  const start = Math.max(0, Math.floor(page) - 1) * size
  return plan.ranges.slice(start, start + size).map((range, index) => {
    const line = plan.doc.lineAt(range.from), endLine = plan.doc.lineAt(range.to)
    let prefix = Math.max(line.from, range.from - 40), suffix = Math.min(endLine.to, range.to + 40)
    if (prefix > line.from && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(plan.doc.sliceString(prefix - 1, prefix + 1))) prefix--
    if (suffix < endLine.to && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(plan.doc.sliceString(suffix - 1, suffix + 1))) suffix++
    const truncated = range.to - range.from > 240
    let match = plan.doc.sliceString(range.from, Math.min(range.to, range.from + 240))
    if (truncated) match = match.replace(/[\uD800-\uDBFF]$/, '') + '…'
    return { id: start + index + 1, line: line.number, column: range.from - line.from + 1,
      prefix: plan.doc.sliceString(prefix, range.from), suffix: plan.doc.sliceString(range.to, suffix), match,
      zeroWidth: range.from === range.to }
  })
}
