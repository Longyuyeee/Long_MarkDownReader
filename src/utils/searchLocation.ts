/** UTF-16 offsets for editor selections, including expanding Unicode lowercase mappings. */
export function searchRanges(text: string, query: string): Array<{ from: number; to: number }> {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const folded = text.toLowerCase()
  const starts: number[] = [], ends: number[] = []
  // Most documents retain UTF-16 length: avoid two per-character arrays for large files.
  if (folded.length !== text.length) {
    let offset = 0
    for (const char of text) {
      const lower = char.toLowerCase()
      for (let i = 0; i < lower.length; i++) { starts.push(offset); ends.push(offset + char.length) }
      offset += char.length
    }
  }
  const matches: Array<{ from: number; to: number }> = []
  for (let at = folded.indexOf(needle); at >= 0; at = folded.indexOf(needle, at + needle.length)) {
    const from = starts.length ? starts[at] : at
    const to = ends.length ? ends[at + needle.length - 1] : at + needle.length
    if (!matches.length || from >= matches[matches.length - 1].to) matches.push({ from, to })
  }
  return matches
}

export const firstSearchRange = (text: string, query: string) => searchRanges(text, query)[0] ?? null

export function wrapSearchIndex(index: number, count: number) {
  return count ? ((index % count) + count) % count : 0
}

/** Read DOM text without inserting markup or changing the editor document. */
export function editorSearchMatches(root: HTMLElement, query: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Array<{ node: Text; offset: number }> = []
  let text = ''
  let previousBlock: Element | null = null
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (node.parentElement?.closest('script, style, [hidden]')) continue
    const nonEditable = node.parentElement?.closest('[contenteditable="false"]')
    if (nonEditable && nonEditable !== root) continue
    const block = node.parentElement?.closest('p, li, pre, h1, h2, h3, h4, h5, h6, td, th, [data-block="0"]') ?? null
    if (nodes.length && block !== previousBlock) text += '\n'
    nodes.push({ node, offset: text.length })
    text += node.data
    previousBlock = block
  }
  const matches = searchRanges(text, query)
  return {
    count: matches.length,
    rangeAt(index: number): Range | null {
      const match = matches[index]
      if (!match) return null
      const range = document.createRange()
      let started = false
      for (const { node, offset } of nodes) {
        const end = offset + node.length
        if (!started && match.from >= offset && match.from < end) {
          range.setStart(node, match.from - offset)
          started = true
        }
        if (started && match.to >= offset && match.to <= end) {
          range.setEnd(node, match.to - offset)
          return range
        }
      }
      return null
    },
  }
}

export const findEditorSearchRange = (root: HTMLElement, query: string) => editorSearchMatches(root, query).rangeAt(0)

/** Scroll to the actual match, including matches far down a single long paragraph. */
export function scrollSearchRange(range: Range) {
  for (let parent = range.startContainer.parentElement; parent; parent = parent.parentElement) {
    if (parent.scrollHeight <= parent.clientHeight || !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) continue
    const rect = range.getBoundingClientRect()
    const viewport = parent.getBoundingClientRect()
    parent.scrollBy({ top: rect.top - viewport.top - parent.clientHeight / 2, behavior: 'auto' })
  }
}
