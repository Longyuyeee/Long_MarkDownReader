/** Linear summary; never run a quadratic diff for every row in a history list. */
export function historyChangeSummary(previous: string | undefined, content: string): string {
  if (previous === undefined) return `${content.length.toLocaleString()} 字 · 最早保留的版本`
  if (content.length > 200000 || previous.length > 200000) return `${content.length.toLocaleString()} 字 · 内容有变化`
  const before = previous.replace(/\r\n?/g,'\n').split('\n'), after = content.replace(/\r\n?/g,'\n').split('\n')
  let start = 0, end = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  while (end < before.length-start && end < after.length-start && before[before.length-end-1] === after[after.length-end-1]) end++
  const removed = before.length-start-end, added = after.length-start-end
  return !removed && !added ? '正文相同' : `变更区域：${added} 行新内容 · ${removed} 行旧内容`
}
