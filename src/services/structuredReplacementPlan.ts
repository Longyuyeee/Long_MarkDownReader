import { ChangeSet, type EditorState, type Text } from '@codemirror/state'
import { getSearchQuery, type SearchQuery } from '@codemirror/search'
import { createNativeSearchQuery } from './boundedSearchQuery.ts'

export interface ReplacementPlan {
  doc: Text; query: SearchQuery; changes: ChangeSet
  edits: readonly { from: number; to: number; insert: string }[]
  matches: number; unchanged: number
}

// Selection refers only to edits in this immutable plan, never to positions in
// a subsequently changed document. The caller still validates the plan owner.
export function selectedReplacementChanges(plan: ReplacementPlan, excluded: ReadonlySet<number>): ChangeSet | undefined {
  for (const index of excluded) if (!Number.isInteger(index) || index < 0 || index >= plan.edits.length) return
  if (excluded.size === plan.edits.length) return
  return excluded.size ? ChangeSet.of(plan.edits.filter((_, index) => !excluded.has(index)), plan.doc.length) : plan.changes
}
export function buildReplacementPlan(state: EditorState, limits = { matches: 10000, changedText: 4000000, insertedText: 2000000 }): { plan?: ReplacementPlan; message?: string } {
  const query = getSearchQuery(state)
  if (state.readOnly) return { message: '只读文件可以查找，不能替换' }
  if (!query.search) return { message: '请输入查找内容' }
  if (!query.valid) return { message: '正则表达式无效' }
  const native = createNativeSearchQuery(query), cursor = query.getCursor(state)
  const edits: { from: number; to: number; insert: string }[] = []
  let matches = 0, unchanged = 0, insertedText = 0, changedText = 0
  const tooLarge = () => ({ message: '预览内容较多，请缩小选区后重试；也可使用原有的全部替换' })
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    if (++matches > limits.matches) return tooLarge()
    const match = next.value as { from: number; to: number; precise?: boolean; match?: RegExpExecArray }
    if (!match.precise) continue // same complete-character constraint as native replaceAll
    const raw = native.getReplacement(match)
    insertedText += raw.length; changedText += match.to - match.from + raw.length
    if (insertedText > limits.insertedText || changedText > limits.changedText) return tooLarge()
    // EditorState.changes normalizes line separators in the same way. Show the
    // actual editor text rather than a CRLF/CR string that it would normalize.
    const insert = state.toText(raw).toString()
    if (state.doc.sliceString(match.from, match.to) === insert) { unchanged++; continue }
    edits.push({ from: match.from, to: match.to, insert })
  }
  if (!edits.length) return { message: matches ? '替换前后内容相同，或匹配不适合直接替换' : '没有匹配内容' }
  return { plan: { doc: state.doc, query, changes: state.changes(edits), edits: Object.freeze(edits), matches, unchanged } }
}

const sample = (text: string, shortened = false) => {
  const truncated = shortened || text.length > 240, head = text.slice(0, 240)
  return (truncated ? head.replace(/[\uD800-\uDBFF]$/, '') : head) + (truncated ? '…' : '')
}
export function replacementRows(plan: ReplacementPlan, page: number, size = 20) {
  const start = Math.max(0, Math.floor(page) - 1) * size
  return plan.edits.slice(start, start + size).map((edit, index) => {
    const line = plan.doc.lineAt(edit.from), endLine = plan.doc.lineAt(edit.to)
    let prefix = Math.max(line.from, edit.from - 40), suffix = Math.min(endLine.to, edit.to + 40)
    if (prefix > line.from && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(plan.doc.sliceString(prefix - 1, prefix + 1))) prefix--
    if (suffix < endLine.to && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(plan.doc.sliceString(suffix - 1, suffix + 1))) suffix++
    return { id: start + index + 1, line: line.number, column: edit.from - line.from + 1,
      prefix: plan.doc.sliceString(prefix, edit.from), suffix: plan.doc.sliceString(edit.to, suffix),
      before: sample(plan.doc.sliceString(edit.from, Math.min(edit.to, edit.from + 240)), edit.to - edit.from > 240),
      after: sample(edit.insert), insertion: edit.from === edit.to, deletion: !edit.insert }
  })
}
