import type { EditorView } from '@codemirror/view'
import type { Text } from '@codemirror/state'
const documentDigests = new WeakMap<Text, Promise<string>>()
export function structuredDocumentDigest(doc: Text): Promise<string> {
  let value = documentDigests.get(doc)
  if (!value) { value = structuredPositionDigest(doc.toString()).catch(() => ''); documentDigests.set(doc, value) }
  return value
}
// Window-local reading metadata. Neither source text nor undo history is kept.
export interface StructuredPosition {
  digest: Promise<string>
  ranges: { anchor: number; head: number }[]
  mainIndex: number
  source: { top: number; left: number; snapshot?: ReturnType<EditorView['scrollSnapshot']> }
  panes: Record<string, { top: number; left: number }>
}
const positions = new WeakMap<object, { scope: string; lease: object; position?: StructuredPosition }>()
const copy = (point: StructuredPosition): StructuredPosition => ({ ...point,
  ranges: point.ranges.map(range => ({ ...range })), source: { ...point.source },
  panes: Object.fromEntries(Object.entries(point.panes).map(([key, value]) => [key, { ...value }])),
})
export function claimStructuredPosition(tab: object, scope: string) {
  const prior = positions.get(tab), lease = {}
  const entry = { scope, lease, position: prior?.scope === scope && prior.position ? copy(prior.position) : undefined }
  positions.set(tab, entry)
  return {
    position: entry.position && copy(entry.position),
    remember(point: StructuredPosition) { if (positions.get(tab)?.lease === lease) entry.position = copy(point) },
    current: () => positions.get(tab)?.lease === lease,
  }
}

// UTF-16 preserves even temporarily incomplete surrogate pairs in a draft.
// A digest identifies reading positions only, never a trusted save baseline.
export async function structuredPositionDigest(source: string): Promise<string> {
  const bytes = new Uint8Array(source.length * 2)
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index); bytes[index * 2] = code & 255; bytes[index * 2 + 1] = code >>> 8
  }
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
}
