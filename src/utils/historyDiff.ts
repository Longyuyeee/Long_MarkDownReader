export interface DiffLine { text: string; kind: 'same' | 'added' | 'removed'; changeId?: number }
export interface HistoryChange { id: number; currentStart: number; currentCount: number; historicalStart: number; historicalCount: number }
// Bounded work: large changes use an explicitly labelled changed-block display.
export function historyDiff(current: string, historical: string): { lines: DiffLine[]; changes: HistoryChange[]; simplified: boolean; truncated: boolean } {
  const previewLimited = current.length > 200000 || historical.length > 200000
  const a = current.slice(0, 200000).replace(/\r\n?/g, '\n').split('\n'), b = historical.slice(0, 200000).replace(/\r\n?/g, '\n').split('\n')
  let prefix = 0, suffix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - suffix - 1] === b[b.length - suffix - 1]) suffix++
  const left = a.slice(prefix, a.length - suffix), right = b.slice(prefix, b.length - suffix)
  const simplified = left.length * right.length > 250000 || left.length + right.length > 10000
  const lines: DiffLine[] = a.slice(Math.max(0, prefix - 3), prefix).map(text => ({ text, kind: 'same' }))
  const changes: HistoryChange[] = []
  if (simplified) {
    lines.push(...left.slice(0, 500).map(text => ({ text, kind: 'removed' as const })), ...right.slice(0, 500).map(text => ({ text, kind: 'added' as const })))
  } else {
    const rows = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1))
    for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--)
      rows[i][j] = left[i] === right[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1])
    let i = 0, j = 0, change: HistoryChange | undefined
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) { change = undefined; lines.push({ text: left[i++], kind: 'same' }); j++ }
      else {
        if (!change) { change = { id: changes.length, currentStart: prefix + i, currentCount: 0, historicalStart: prefix + j, historicalCount: 0 }; changes.push(change) }
        if (i < left.length && (j >= right.length || rows[i + 1][j] >= rows[i][j + 1])) { lines.push({ text: left[i++], kind: 'removed', changeId: change.id }); change.currentCount++ }
        else { lines.push({ text: right[j++], kind: 'added', changeId: change.id }); change.historicalCount++ }
      }
    }
  }
  lines.push(...a.slice(a.length - suffix, a.length - suffix + 3).map(text => ({ text, kind: 'same' as const })))
  return { lines: lines.slice(0, 2000), changes, simplified, truncated: previewLimited || simplified && (left.length > 500 || right.length > 500) || lines.length > 2000 }
}

/** Restore one contiguous change; preserve all other lines and their original separators. */
export function restoreHistoryChange(current: string, historical: string, id: number): string {
  const diff = historyDiff(current, historical), change = diff.changes.find(item => item.id === id)
  if (diff.simplified || diff.truncated || !change) throw new Error('此处无法局部恢复，请重新比较或使用整篇恢复')
  const fallback = current.match(/\r\n|\r|\n/)?.[0] || historical.match(/\r\n|\r|\n/)?.[0] || '\n'
  const split = (value: string) => {
    const separators = value.match(/\r\n|\r|\n/g) || []
    return value.split(/\r\n|\r|\n/).map((text, index) => ({ text, separator: separators[index] || fallback }))
  }
  const left = split(current), right = split(historical)
  const result = [...left.slice(0, change.currentStart), ...right.slice(change.historicalStart, change.historicalStart + change.historicalCount), ...left.slice(change.currentStart + change.currentCount)]
  return result.map((line, index) => line.text + (index < result.length - 1 ? line.separator : '')).join('')
}
