// Window-local, per-library inputs only. Never retain document text, offsets,
// selection ranges or replacement proposals, and never persist on disk.
export interface StructuredSearchCondition {
  search: string; replace: string; caseSensitive: boolean; regexp: boolean
  wholeWord: boolean; literal: boolean
}
const histories = new Map<string, StructuredSearchCondition[]>()
const copy = (value: StructuredSearchCondition): StructuredSearchCondition => ({
  search: value.search, replace: value.replace, caseSensitive: value.caseSensitive,
  regexp: value.regexp, wholeWord: value.wholeWord, literal: value.literal,
})
const same = (a: StructuredSearchCondition, b: StructuredSearchCondition) =>
  a.search === b.search && a.replace === b.replace && a.caseSensitive === b.caseSensitive
  && a.regexp === b.regexp && a.wholeWord === b.wholeWord && a.literal === b.literal
export function structuredSearchHistory(library: string) {
  return {
    list: () => (histories.get(library) || []).map(copy),
    remember(value: StructuredSearchCondition) {
      if (!library || !value.search) return
      const condition = copy(value)
      histories.set(library, [condition, ...(histories.get(library) || []).filter(item => !same(item, condition))].slice(0, 10))
    },
    clear: () => { histories.delete(library) },
  }
}
