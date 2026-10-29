import { EditorSelection, MapMode, StateEffect, StateField, Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

export interface StructuredNavigationContext {
  view?: 'source' | 'tree'
  outline?: string
  tree?: string
  panes?: Record<string, { top: number; left: number }>
}
export interface ReturnPoint {
  selection: EditorSelection
  scroll: ReturnType<EditorView['scrollSnapshot']>
  kind?: 'search' | 'structure'
  context?: StructuredNavigationContext
}
export const SEARCH_RETURN_LIMIT = 20
const push = StateEffect.define<ReturnPoint>()
const travel = StateEffect.define<{ direction: 'back' | 'forward'; origin: ReturnPoint }>()
export const clearSearchReturn = StateEffect.define<void>()

function mapPoints(points: readonly ReturnPoint[], transaction: Transaction) {
  if (!transaction.docChanged) return points
  return points.flatMap(point => {
    if (point.selection.ranges.some(range => [range.anchor, range.head].some(pos =>
      transaction.changes.mapPos(pos, 1, MapMode.TrackDel) === null))) return []
    const scroll = point.scroll.map(transaction.changes)
    return scroll ? [{ ...point, selection: point.selection.map(transaction.changes), scroll }] : []
  })
}

// Positions live in this editor state only. Replacing a file never carries old
// coordinates into another document; normal edits map both selection and scroll.
export const searchReturnPoints = StateField.define<readonly ReturnPoint[]>({
  create: () => [],
  update(points, transaction) {
    points = mapPoints(points, transaction)
    for (const effect of transaction.effects) {
      if (effect.is(clearSearchReturn)) points = []
      else if (effect.is(travel)) points = effect.value.direction === 'back'
        ? points.slice(0, -1) : [...points, effect.value.origin].slice(-SEARCH_RETURN_LIMIT)
      else if (effect.is(push)) points = [...points, effect.value].slice(-SEARCH_RETURN_LIMIT)
    }
    return points
  },
})

export const searchForwardPoints = StateField.define<readonly ReturnPoint[]>({
  create: () => [],
  update(points, transaction) {
    points = mapPoints(points, transaction)
    for (const effect of transaction.effects) {
      if (effect.is(clearSearchReturn) || effect.is(push)) points = []
      else if (effect.is(travel)) points = effect.value.direction === 'forward'
        ? points.slice(0, -1) : [...points, effect.value.origin].slice(-SEARCH_RETURN_LIMIT)
    }
    return points
  },
})

export function captureSearchReturn(view: EditorView, context?: StructuredNavigationContext, scroll = view.scrollSnapshot()): ReturnPoint {
  return { selection: view.state.selection, scroll, context }
}
export function locateSearchMatch(view: EditorView, from: number, to: number, origin = captureSearchReturn(view), kind: ReturnPoint['kind'] = 'search') {
  const selection = view.state.selection
  const same = origin.context?.view !== 'tree' && selection.ranges.length === 1 && selection.main.anchor === from && selection.main.head === to
  view.dispatch({ selection: { anchor: from, head: to },
    effects: [...(same ? [] : [push.of({ ...origin, kind })]), EditorView.scrollIntoView(from, { y: 'center' })],
    annotations: Transaction.addToHistory.of(false) })
}

function navigate(view: EditorView, direction: 'back' | 'forward', focus: boolean, origin: ReturnPoint): boolean {
  const points = view.state.field(direction === 'back' ? searchReturnPoints : searchForwardPoints, false)
  const point = points?.[points.length - 1]
  if (!point) return false
  view.dispatch({ selection: point.selection, effects: [travel.of({ direction, origin: { ...origin, kind: point.kind } }), point.scroll], annotations: Transaction.addToHistory.of(false) })
  if (focus) view.focus()
  return true
}

export function returnFromSearch(view: EditorView, focus = true, origin = captureSearchReturn(view)): boolean {
  return navigate(view, 'back', focus, origin)
}
export function forwardFromSearch(view: EditorView, focus = true, origin = captureSearchReturn(view)): boolean {
  return navigate(view, 'forward', focus, origin)
}
