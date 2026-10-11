export interface DiffLine { text: string; kind: 'same' | 'added' | 'removed' }
// Bounded work: large changes use an explicitly labelled changed-block display.
export function historyDiff(current: string, historical: string): { lines: DiffLine[]; simplified: boolean; truncated: boolean } {
  const previewLimited = current.length > 200000 || historical.length > 200000
  const a = current.slice(0, 200000).replace(/\r\n?/g, '\n').split('\n'), b = historical.slice(0, 200000).replace(/\r\n?/g, '\n').split('\n')
  let prefix = 0, suffix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - suffix - 1] === b[b.length - suffix - 1]) suffix++
  const left = a.slice(prefix, a.length - suffix), right = b.slice(prefix, b.length - suffix)
  const simplified = left.length * right.length > 250000 || left.length + right.length > 10000
  const lines: DiffLine[] = a.slice(Math.max(0, prefix - 3), prefix).map(text => ({ text, kind: 'same' }))
  if (simplified) {
    lines.push(...left.slice(0, 500).map(text => ({ text, kind: 'removed' as const })), ...right.slice(0, 500).map(text => ({ text, kind: 'added' as const })))
  } else {
    const rows = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1))
    for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--)
      rows[i][j] = left[i] === right[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1])
    let i = 0, j = 0
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) { lines.push({ text: left[i++], kind: 'same' }); j++ }
      else if (i < left.length && (j >= right.length || rows[i + 1][j] >= rows[i][j + 1])) lines.push({ text: left[i++], kind: 'removed' })
      else lines.push({ text: right[j++], kind: 'added' })
    }
  }
  lines.push(...a.slice(a.length - suffix, a.length - suffix + 3).map(text => ({ text, kind: 'same' as const })))
  return { lines: lines.slice(0, 2000), simplified, truncated: previewLimited || simplified && (left.length > 500 || right.length > 500) || lines.length > 2000 }
}
