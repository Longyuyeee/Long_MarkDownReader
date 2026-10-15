/** Literal matching, preserving original Unicode characters and never producing HTML. */
export function searchHighlight(text: string, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return [{ text, match: false }]
  const chars = Array.from(text)
  const offsets: number[] = []
  let folded = ''
  for (const [index, char] of chars.entries()) {
    const lower = char.toLowerCase()
    for (let i = 0; i < lower.length; i++) offsets.push(index)
    folded += lower
  }
  const ranges: Array<[number, number]> = []
  for (let at = folded.indexOf(needle); at >= 0; at = folded.indexOf(needle, at + needle.length)) {
    const start = offsets[at], end = offsets[at + needle.length - 1] + 1
    const last = ranges[ranges.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(end, last[1])
    else ranges.push([start, end])
  }
  const result: Array<{ text: string; match: boolean }> = []
  let cursor = 0
  for (const [start, end] of ranges) {
    if (cursor < start) result.push({ text: chars.slice(cursor, start).join(''), match: false })
    result.push({ text: chars.slice(start, end).join(''), match: true })
    cursor = end
  }
  if (cursor < chars.length || !result.length) result.push({ text: chars.slice(cursor).join(''), match: false })
  return result
}

/** Highlight positive query terms only; excluded words and operators are not matches. */
export function searchTermsHighlight(text: string, terms: string[]) {
  const marked = new Uint8Array(text.length)
  for (const term of terms) {
    let offset = 0
    for (const part of searchHighlight(text, term)) { if (part.match) marked.fill(1, offset, offset + part.text.length); offset += part.text.length }
  }
  const parts: Array<{ text: string; match: boolean }> = []; let offset = 0
  for (const char of text) {
    const match = Boolean(marked[offset]); const last = parts[parts.length - 1]
    if (last?.match === match) last.text += char; else parts.push({ text: char, match })
    offset += char.length
  }
  return parts.length ? parts : [{ text, match: false }]
}
