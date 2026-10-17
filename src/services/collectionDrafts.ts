// Conditions only, volatile and bounded. Never store document text/results.
export interface CollectionDraft { id: string; name: string; query: string; directory: string; tag: string; days: number | null; objectTypes: string[]; baseline: string; advanced: boolean }
const drafts = new Map<string, CollectionDraft>()
const key = (root: string, id: string) => root.replace(/\\/g, '/').toLowerCase() + '\n' + id
export function rememberCollectionDraft(root: string, draft: CollectionDraft | null, id = draft?.id || '') {
  const identity = key(root, id); drafts.delete(identity)
  if (!draft) return
  drafts.set(identity, JSON.parse(JSON.stringify(draft)))
  while (drafts.size > 64) drafts.delete(drafts.keys().next().value!)
}
export function readCollectionDraft(root: string, id: string) { const draft = drafts.get(key(root, id)); return draft ? JSON.parse(JSON.stringify(draft)) as CollectionDraft : null }
