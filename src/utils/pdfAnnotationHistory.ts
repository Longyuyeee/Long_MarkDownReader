import type { PdfAnnotation } from '../types/pdfAnnotations'

interface Change {
  before: PdfAnnotation | null
  after: PdfAnnotation | null
  index: number
  label: string
  selectedBefore: string
  selectedAfter: string
  group?: string
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Keep only changed annotations in memory; never persist comments in view metadata.
export class PdfAnnotationHistory {
  private source = ''
  private past: Change[] = []
  private future: Change[] = []
  private group = ''
  private bytes = 0
  reset(source = '') { this.source = source; this.past = []; this.future = []; this.group = ''; this.bytes = 0 }
  endGroup() { this.group = '' }
  get undoLabel() { return this.past[this.past.length - 1]?.label || '' }
  get redoLabel() { return this.future[this.future.length - 1]?.label || '' }
  record(source: string, change: Change) {
    if (source !== this.source) this.reset(source)
    if (!source || equal(change.before, change.after)) return
    const previous = this.past[this.past.length - 1]
    this.bytes -= this.future.reduce((total, entry) => total + JSON.stringify(entry).length, 0)
    if (change.group && this.group === change.group && previous?.group === change.group
      && equal(previous.after, change.before)) {
      this.bytes -= JSON.stringify(previous).length
      previous.after = clone(change.after)
      previous.selectedAfter = change.selectedAfter
      if (equal(previous.before, previous.after)) this.past.pop()
      else this.bytes += JSON.stringify(previous).length
    } else { this.past.push(clone(change)); this.bytes += JSON.stringify(change).length }
    this.group = change.group || ''
    this.future = []
    // Comments may be large. Bound memory as well as operation count.
    while (this.past.length > 80 || this.bytes > 4_000_000) this.bytes -= JSON.stringify(this.past.shift()).length
  }
  apply(source: string, annotations: PdfAnnotation[], direction: 'undo' | 'redo') {
    this.endGroup()
    if (!source || source !== this.source) { this.reset(source); return null }
    const from = direction === 'undo' ? this.past : this.future
    const to = direction === 'undo' ? this.future : this.past
    const change = from[from.length - 1]
    if (!change) return null
    const expected = direction === 'undo' ? change.after : change.before
    const replacement = direction === 'undo' ? change.before : change.after
    const id = (expected || replacement)!.id
    const index = annotations.findIndex(a => a.id === id)
    if (!equal(index < 0 ? null : annotations[index], expected)) { this.reset(source); return null }
    const result = [...annotations]
    if (index >= 0) result.splice(index, 1)
    if (replacement) result.splice(Math.min(change.index, result.length), 0, clone(replacement))
    from.pop(); to.push(change)
    const selected = direction === 'undo' ? change.selectedBefore : change.selectedAfter
    return { annotations: result, selected: result.some(a => a.id === selected) ? selected : '' }
  }
}
