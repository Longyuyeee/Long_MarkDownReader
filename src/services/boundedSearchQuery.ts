import { EditorState, type Text } from '@codemirror/state'
import { SearchQuery } from '@codemirror/search'

type Match = { from: number; to: number; precise?: boolean; match?: RegExpExecArray }
type Bounds = { from: number; to: number } | null | undefined
interface NativeQuery {
  spec: SearchQuery
  nextMatch(state: EditorState, from: number, to: number): Match | null
  prevMatch(state: EditorState, from: number, to: number): Match | null
  matchAll(state: EditorState, limit: number): Match[] | null
  getReplacement(match: Match): string
  highlight(state: EditorState, from: number, to: number, add: (from: number, to: number) => void): void
}

// CodeMirror's public match filter excludes results but a greedy regex can
// already have consumed text outside the selection. Bound the cursor itself.
// This small compatibility adapter targets the locked search version's query
// factory, keeping its replacement syntax, commands, focus and announcements.
// The native command tests exercise this boundary when the dependency changes.
const factory = Reflect.get(SearchQuery.prototype, 'create') as (this: SearchQuery) => NativeQuery

export function createNativeSearchQuery(query: SearchQuery): NativeQuery {
  if (typeof factory !== 'function') throw new Error('源码查找组件不兼容，请更新应用')
  const native = factory.call(query)
  for (const name of ['nextMatch', 'prevMatch', 'matchAll', 'getReplacement', 'highlight'] as const) {
    if (typeof native[name] !== 'function') throw new Error('源码查找组件不兼容，请更新应用')
  }
  return native
}

export class BoundedSearchQuery extends SearchQuery {
  private bounds: (state: EditorState) => Bounds
  constructor(config: ConstructorParameters<typeof SearchQuery>[0], bounds: (state: EditorState) => Bounds) { super(config); this.bounds = bounds }
  getCursor(state: EditorState | Text, from = 0, to?: number): Iterator<Match> {
    const range = state instanceof EditorState ? this.bounds(state) : undefined
    if (range === null) return [][Symbol.iterator]()
    if (range) { from = Math.max(from, range.from); to = Math.min(to ?? (state instanceof EditorState ? state.doc.length : state.length), range.to) }
    return to !== undefined && from > to ? [][Symbol.iterator]() : super.getCursor(state, from, to)
  }
  create(): NativeQuery {
    const native = createNativeSearchQuery(this), query = this
    const all = (state: EditorState, limit: number) => {
      const result: Match[] = [], cursor = query.getCursor(state)
      for (let next = cursor.next(); !next.done; next = cursor.next()) {
        if (result.length === limit) return null
        result.push(next.value)
      }
      return result
    }
    let highlighted: { doc: Text; range: Bounds; head: number; cursor: Iterator<Match>; ranges: { from: number; to: number }[]; done: boolean } | undefined
    return { spec: this, getReplacement: match => native.getReplacement(match),
      nextMatch(state, from, to) {
        if (query.bounds(state) === undefined) return native.nextMatch(state, from, to)
        let first: Match | null = null
        const cursor = query.getCursor(state)
        for (let next = cursor.next(); !next.done; next = cursor.next()) {
          const match = next.value
          if (match.from === from && match.to === to) continue
          first ||= match
          if (match.from >= to) return match
        }
        return first
      },
      prevMatch(state, from, to) {
        if (query.bounds(state) === undefined) return native.prevMatch(state, from, to)
        let last: Match | null = null, previous: Match | null = null
        const cursor = query.getCursor(state)
        for (let next = cursor.next(); !next.done; next = cursor.next()) {
          const match = next.value
          if (match.from === from && match.to === to) continue
          if (match.to > from && previous) return previous
          last = match
          if (match.to <= from) previous = match
        }
        return previous || last
      },
      matchAll: (state, limit) => query.bounds(state) === undefined ? native.matchAll(state, limit) : all(state, limit),
      highlight(state, from, to, add) {
        const range = query.bounds(state)
        if (range === undefined) { native.highlight(state, from, to, add); return }
        const head = query.wholeWord ? state.selection.main.head : -1
        if (!highlighted || highlighted.doc !== state.doc || highlighted.range !== range || highlighted.head !== head) {
          highlighted = { doc: state.doc, range, head, cursor: query.getCursor(state), ranges: [], done: false }
        }
        // Reuse current-document offsets while navigating, rather than scanning
        // the prefix again on every caret move. No regex input strings are kept.
        while (!highlighted.done && (!highlighted.ranges.length || highlighted.ranges[highlighted.ranges.length - 1].from <= to)) {
          const next = highlighted.cursor.next()
          if (next.done) highlighted.done = true
          else highlighted.ranges.push({ from: next.value.from, to: next.value.to })
        }
        for (const match of highlighted.ranges) {
          if (match.from > to) break
          if (match.to >= from) add(match.from, match.to)
        }
      },
    }
  }
}
