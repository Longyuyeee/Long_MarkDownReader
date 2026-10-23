import { Text } from '@codemirror/state'

export interface StructuredIdentity {
  root: string; path: string; external: boolean; format: string
  signature: string; encoding: string
}

// Session-local, keyed by the actual tab. Restored/transported drafts do not
// acquire a trusted baseline just because they carry a signature or clean flag.
// Immutable CodeMirror text permits exact comparison without reparsing source,
// disk reads, or treating a hash/parsed structure as proof of equal contents.
const savepoints = new WeakMap<object, StructuredIdentity & { doc: Text }>()
export const forgetStructuredSavepoint = (tab: object) => { savepoints.delete(tab) }
export const structuredEditorText = (source: string) => source.replace(/\r\n?/g, '\n')
export function recordStructuredSavepoint(tab: object, identity: StructuredIdentity, source: string) {
  if (!identity.signature) { savepoints.delete(tab); return }
  const { root, path, external, format, signature, encoding } = identity
  savepoints.set(tab, { root, path, external, format, signature, encoding, doc: Text.of(structuredEditorText(source).split('\n')) })
}
export function matchesStructuredSavepoint(tab: object, identity: StructuredIdentity, doc: Text): boolean {
  const point = savepoints.get(tab)
  return Boolean(point && point.root === identity.root && point.path === identity.path
    && point.external === identity.external && point.format === identity.format
    && point.signature === identity.signature && point.encoding === identity.encoding && point.doc.eq(doc))
}
