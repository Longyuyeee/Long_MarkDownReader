export interface AttachmentDraft { document: string; content: string }
interface DraftTab { path: string; content?: string; isDirty: boolean; textReadOnlyReason?: string; textLoadError?: string }
const key = (path: string) => path.replace(/\\/g, '/').replace(/^\/\/\?\//, '').replace(/\/+$/, '').toLowerCase()

// Capture the editor into its existing tab first. Copy strings only; this query
// must never save, reload or mutate a note to make the disk inventory look fresh.
export function attachmentDrafts(root: string, tabs: readonly DraftTab[]): AttachmentDraft[] {
  const prefix = key(root) + '/', result = new Map<string, AttachmentDraft>()
  for (const tab of tabs) {
    if (!tab.isDirty || !/\.(md|markdown)$/i.test(tab.path) || !key(tab.path).startsWith(prefix)) continue
    if (typeof tab.content !== 'string' || tab.textReadOnlyReason || tab.textLoadError) {
      throw Error('有笔记草稿暂时无法完整读取，请回到该笔记核对后重试；草稿已保留。')
    }
    const identity = key(tab.path), previous = result.get(identity)
    if (previous && previous.content !== tab.content) throw Error('同一篇笔记存在不同草稿，请核对后重试；草稿均已保留。')
    result.set(identity, { document: previous?.document || tab.path, content: tab.content })
  }
  return [...result].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value)
}
