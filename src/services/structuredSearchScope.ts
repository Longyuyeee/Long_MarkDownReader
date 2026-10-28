import { EditorState, StateEffect, StateField, type ChangeDesc, type Transaction } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'
import { invertedEffects } from '@codemirror/commands'
import { getSearchQuery, SearchQuery, setSearchQuery } from '@codemirror/search'
import { BoundedSearchQuery } from './boundedSearchQuery.ts'

export type SearchScopeReason = 'empty' | 'changed' | 'external' | 'waiting'
export interface SourceSearchScope {
  enabled: boolean; intent: object; range?: { from: number; to: number }; reason?: SearchScopeReason
}
const mapScope = (scope: SourceSearchScope, changes: ChangeDesc): SourceSearchScope => {
  if (!scope.enabled) return scope
  if (!scope.range) return scope.reason === 'waiting' ? { ...scope, reason: 'changed' } : scope
  const from = changes.mapPos(scope.range.from, -1), to = changes.mapPos(scope.range.to, 1)
  return from < to ? { ...scope, range: { from, to } } : { ...scope, range: undefined, reason: 'changed' }
}
export const setSourceSearchScope = StateEffect.define<SourceSearchScope>()
const restoreScope = StateEffect.define<SourceSearchScope>({ map: mapScope })
const validScope = (scope: SourceSearchScope, length: number): SourceSearchScope => {
  if (!scope.enabled || !scope.range) return scope
  const { from, to } = scope.range
  return Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to <= length && from < to
    ? scope : { ...scope, range: undefined, reason: 'changed' }
}
export const sourceSearchScope = StateField.define<SourceSearchScope>({
  create: () => ({ enabled: false, intent: {} }),
  update(scope, tr) {
    let next = tr.docChanged ? mapScope(scope, tr.changes) : scope
    for (const effect of tr.effects) {
      if (effect.is(setSourceSearchScope)) next = validScope(effect.value, tr.newDoc.length)
      // A later explicit scope choice wins over the scope belonging to an old edit.
      else if (effect.is(restoreScope) && next.intent === effect.value.intent) next = validScope(effect.value, tr.newDoc.length)
    }
    return next
  },
})
export function scopeFromSelection(state: EditorState, enabled = true): SourceSearchScope {
  const selection = state.selection.main
  return !enabled ? { enabled: false, intent: {} } : selection.empty
    ? { enabled: true, intent: {}, reason: 'empty' }
    : { enabled: true, intent: {}, range: { from: selection.from, to: selection.to } }
}
// The predicate reads the current transaction's scope, never an old match list.
const inScope = (_match: string, state: EditorState, from: number, to: number) => {
  const scope = state.field(sourceSearchScope, false)
  return !!scope && (!scope.enabled || !!scope.range && from >= scope.range.from && to <= scope.range.to)
}
const queryWithScope = (query: SearchQuery) => new BoundedSearchQuery({ search: query.search, replace: query.replace,
  caseSensitive: query.caseSensitive, regexp: query.regexp, wholeWord: query.wholeWord, literal: query.literal, test: inScope }, state => {
    const scope = state.field(sourceSearchScope)
    return scope.enabled ? scope.range || null : undefined
  })
const scopeTransaction = (tr: Transaction) => tr.docChanged || tr.effects.some(effect =>
  effect.is(setSearchQuery) || effect.is(setSourceSearchScope) || effect.is(restoreScope))
export const sourceSearchScopeExtensions = [sourceSearchScope,
  EditorState.transactionExtender.of(tr => scopeTransaction(tr)
    ? { effects: setSearchQuery.of(queryWithScope(getSearchQuery(tr.state))) } : null),
  invertedEffects.of(tr => tr.docChanged && tr.startState.field(sourceSearchScope).enabled
    ? [restoreScope.of(tr.startState.field(sourceSearchScope))] : []),
  EditorView.decorations.compute([sourceSearchScope], state => {
    const scope = state.field(sourceSearchScope)
    return scope.enabled && scope.range ? Decoration.set([
      Decoration.mark({ class: 'cm-source-search-scope' }).range(scope.range.from, scope.range.to),
    ]) : Decoration.none
  }),
  EditorView.baseTheme({ '.cm-source-search-scope': {
    backgroundColor: 'color-mix(in srgb, var(--theme-primary) 8%, transparent)',
    borderBottom: '1px dotted var(--theme-primary)',
  } }),
]
