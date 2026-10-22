import type { PdfAnnotation } from '../types/pdfAnnotations'

interface Patch {
  before: PdfAnnotation | null
  after: PdfAnnotation | null
  index: number
}
interface Context {
  label: string
  selectedBefore: string
  selectedAfter: string
  readingBefore?: string[]
  readingAfter?: string[]
  group?: string
}
interface Change extends Patch, Context {}
interface Entry extends Context { patches: Patch[] }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Keep only changed annotations in memory; never persist comments in view metadata.
export class PdfAnnotationHistory {
  private source = ''
  private past: Entry[] = []
  private future: Entry[] = []
  private group = ''
  private bytes = 0
  reset(source = '') { this.source = source; this.past = []; this.future = []; this.group = ''; this.bytes = 0 }
  endGroup() { this.group = '' }
  get undoLabel() { return this.past[this.past.length - 1]?.label || '' }
  get redoLabel() { return this.future[this.future.length - 1]?.label || '' }
  record(source: string, change: Change) {
    const {before, after, index, ...context} = change
    this.recordBatch(source, [{before, after, index}], context)
  }
  recordBatch(source: string, patches: Patch[], context: Context) {
    if (source !== this.source) this.reset(source)
    patches = patches.filter(patch => !equal(patch.before, patch.after))
    if (!source || !patches.length) return
    const change: Entry = {...context, patches}
    const previous = this.past[this.past.length - 1]
    this.bytes -= this.future.reduce((total, entry) => total + JSON.stringify(entry).length, 0)
    if (change.group && this.group === change.group && previous?.group === change.group
      && previous.patches.length === 1 && patches.length === 1
      && equal(previous.patches[0]!.after, patches[0]!.before)) {
      this.bytes -= JSON.stringify(previous).length
      previous.patches[0]!.after = clone(patches[0]!.after)
      previous.selectedAfter = change.selectedAfter
      if (equal(previous.patches[0]!.before, previous.patches[0]!.after)) this.past.pop()
      else this.bytes += JSON.stringify(previous).length
    } else { this.past.push(clone(change)); this.bytes += JSON.stringify(change).length }
    this.group = change.group || ''
    this.future = []
    // Evict older steps first. A valid batch (at most 200 annotations) must
    // remain undoable even when its comments exceed the normal history budget.
    while (this.past.length > 80 || (this.past.length > 1 && this.bytes > 4_000_000)) this.bytes -= JSON.stringify(this.past.shift()).length
  }
  apply(source: string, annotations: PdfAnnotation[], direction: 'undo' | 'redo') {
    this.endGroup()
    if (!source || source !== this.source) { this.reset(source); return null }
    const from = direction === 'undo' ? this.past : this.future
    const to = direction === 'undo' ? this.future : this.past
    const change = from[from.length - 1]
    if (!change) return null
    const current = new Map(annotations.map(a => [a.id, a]))
    const touched = new Set<string>()
    for (const patch of change.patches) {
      const expected = direction === 'undo' ? patch.after : patch.before
      const id = (patch.before || patch.after)!.id
      if (touched.has(id) || !equal(current.get(id) ?? null, expected)) { this.reset(source); return null }
      touched.add(id)
    }
    const result = annotations.filter(a => !touched.has(a.id))
    for (const patch of [...change.patches].sort((a,b) => a.index - b.index)) {
      const replacement = direction === 'undo' ? patch.before : patch.after
      if (replacement) result.splice(Math.min(patch.index, result.length), 0, clone(replacement))
    }
    from.pop(); to.push(change)
    const selected = direction === 'undo' ? change.selectedBefore : change.selectedAfter
    const ids = new Set(result.map(a => a.id))
    const reading = direction === 'undo' ? change.readingBefore : change.readingAfter
    return { annotations: result, selected: ids.has(selected) ? selected : '', reading: reading?.filter(id => ids.has(id)) }
  }
}
