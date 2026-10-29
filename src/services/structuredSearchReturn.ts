import { EditorSelection, MapMode, StateEffect, StateField, Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

interface ReturnPoint {
  selection: EditorSelection
  scroll: ReturnType<EditorView['scrollSnapshot']>
}
export const SEARCH_RETURN_LIMIT = 20
const push = StateEffect.define<ReturnPoint>()
const pop = StateEffect.define<void>()
export const clearSearchReturn = StateEffect.define<void>()

// Positions live in this editor state only. Replacing a file never carries old
// coordinates into another document; normal edits map both selection and scroll.
export const searchReturnPoints = StateField.define<readonly ReturnPoint[]>({
  create: () => [],
  update(points, transaction) {
    if (transaction.docChanged) points = points.flatMap(point => {
      if (point.selection.ranges.some(range => [range.anchor, range.head].some(pos =>
        transaction.changes.mapPos(pos, 1, MapMode.TrackDel) === null))) return []
      const scroll = point.scroll.map(transaction.changes)
      return scroll ? [{ selection: point.selection.map(transaction.changes), scroll }] : []
    })
    for (const effect of transaction.effects) {
      if (effect.is(clearSearchReturn)) points = []
      else if (effect.is(pop)) points = points.slice(0, -1)
      else if (effect.is(push)) points = [...points, effect.value].slice(-SEARCH_RETURN_LIMIT)
    }
    return points
  },
})

export function locateSearchMatch(view: EditorView, from: number, to: number) {
  const selection = view.state.selection
  const same = selection.ranges.length === 1 && selection.main.anchor === from && selection.main.head === to
  view.dispatch({ selection: { anchor: from, head: to },
    effects: [...(same ? [] : [push.of({ selection, scroll: view.scrollSnapshot() })]), EditorView.scrollIntoView(from, { y: 'center' })],
    annotations: Transaction.addToHistory.of(false) })
}

export function returnFromSearch(view: EditorView): boolean {
  const points = view.state.field(searchReturnPoints), point = points[points.length - 1]
  if (!point) return false
  view.dispatch({ selection: point.selection, effects: [pop.of(), point.scroll], annotations: Transaction.addToHistory.of(false) })
  view.focus()
  return true
}
