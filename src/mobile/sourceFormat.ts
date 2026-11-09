import { RangeSet, RangeValue, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state'
import { invertedEffects } from '@codemirror/commands'

class OriginalBreak extends RangeValue {
  startSide = 1
  endSide = -1
  readonly text: string
  constructor(text: string) { super(); this.text = text }
}
interface SourceFormat { preferred: string; exceptions: RangeSet<OriginalBreak> }
function formatOf(content: string): SourceFormat {
  const matches = [...content.matchAll(/\r\n|\r|\n/g)], preferred = matches[0]?.[0] || '\n'
  let removed = 0
  const ranges = matches.flatMap(match => {
    const at = match.index - removed; removed += match[0].length - 1
    return match[0] === preferred ? [] : [new OriginalBreak(match[0]).range(at, at + 1)]
  })
  return { preferred, exceptions: RangeSet.of(ranges) }
}
const restoreFormat = StateEffect.define<SourceFormat>({ map: (value, changes) => ({ ...value, exceptions: value.exceptions.map(changes) }) })
const sourceField = StateField.define<SourceFormat>({
  create: () => formatOf(''),
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(restoreFormat)) return effect.value
    const exceptions = value.exceptions.map(transaction.changes)
    return exceptions === value.exceptions ? value : { ...value, exceptions }
  },
})
/** Keep CodeMirror's default LF model for native IME/Enter. Only the source
 * boundary restores line endings; untouched mixed endings remain exact. */
export function sourceFormat(content: string): Extension {
  return [sourceField.init(() => formatOf(content)), invertedEffects.of(transaction => {
    const previous = transaction.startState.field(sourceField)
    return previous === transaction.state.field(sourceField) ? [] : [restoreFormat.of(previous)]
  })]
}
export function adoptSourceFormat(content: string) { return restoreFormat.of(formatOf(content)) }
export function sourceSlice(state: EditorState, from = 0, to = state.doc.length) {
  const format = state.field(sourceField, false)
  if (!format) return state.sliceDoc(from, to)
  let start = from, output = ''
  format.exceptions.between(from, to, (at, end, value) => {
    if (at < from || at >= to || end !== at + 1) return
    output += state.doc.sliceString(start, at).replace(/\n/g, format.preferred) + value.text; start = end
  })
  return output + state.doc.sliceString(start, to).replace(/\n/g, format.preferred)
}
