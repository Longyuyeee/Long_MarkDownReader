export interface ParsedSearchQuery { positive: string[]; negative: string[] }
/** Shared bounded grammar with native search; operators never become editor needles. */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  if (Array.from(query).length > 500) throw new Error('搜索内容不能超过 500 个字符')
  const result: ParsedSearchQuery = { positive: [], negative: [] }, chars = Array.from(query)
  const isSpace = (character: string) => /\p{White_Space}/u.test(character)
  let index = 0
  while (index < chars.length) {
    while (index < chars.length && isSpace(chars[index]!)) index++
    if (index >= chars.length) break
    let negative = chars[index] === '-'
    if (negative) index++
    let value = '', quoted = false
    if (negative && (index >= chars.length || isSpace(chars[index]!))) { negative = false; value = '-' }
    else while (index < chars.length) {
      const character = chars[index]!
      if (isSpace(character) && !quoted) break
      index++
      if (character === '"') quoted = !quoted
      else if (character === '\\' && (chars[index] === '"' || chars[index] === '\\')) value += chars[index++]
      else value += character
    }
    if (quoted) throw new Error('搜索短语缺少结束双引号')
    if (!value) throw new Error('双引号中请填写要查找的内容')
    const terms = negative ? result.negative : result.positive
    value = value.toLowerCase(); if (!terms.includes(value)) terms.push(value)
    if (result.positive.length + result.negative.length > 16) throw new Error('搜索条件不能超过 16 项')
  }
  return result
}
export function searchQueryNeedle(query: string, context = '') {
  try { const terms = parseSearchQuery(query).positive; return terms.find(term => context.toLowerCase().includes(term)) || terms[0] || '' }
  catch { return '' }
}
