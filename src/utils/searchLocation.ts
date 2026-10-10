/** UTF-16 offsets for editor selections, including expanding Unicode lowercase mappings. */
export function firstSearchRange(text: string, query: string): { from: number; to: number } | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return null
  let folded = '', offset = 0
  const starts: number[] = [], ends: number[] = []
  for (const char of text) {
    const lower = char.toLowerCase()
    for (let i = 0; i < lower.length; i++) { starts.push(offset); ends.push(offset + char.length) }
    folded += lower
    offset += char.length
  }
  const at = folded.indexOf(needle)
  return at < 0 ? null : { from: starts[at], to: ends[at + needle.length - 1] }
}

/** Read DOM text without inserting markup or changing the editor document. */
export function findEditorSearchRange(root: HTMLElement, query: string): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let text = ''
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (node.parentElement?.closest('[contenteditable="false"], script, style, [hidden]')) continue
    nodes.push(node)
    text += node.data
  }
  const match = firstSearchRange(text, query)
  if (!match) return null
  const range = document.createRange()
  let offset = 0, started = false
  for (const node of nodes) {
    const end = offset + node.length
    if (!started && match.from < end) { range.setStart(node, match.from - offset); started = true }
    if (started && match.to <= end) { range.setEnd(node, match.to - offset); return range }
    offset = end
  }
  return null
}
