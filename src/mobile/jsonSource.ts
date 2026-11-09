import { parser } from '@lezer/json'

export interface JsonCheck { valid: boolean; message: string; offset?: number; line?: number; column?: number; formatted?: string }
export const JSON_SOURCE_BUDGET = { characters: 256 * 1024, tokens: 40000, depth: 64, formattedBytes: 1024 * 1024, milliseconds: 1800 }

/** Check syntax without ever using the parsed JS values to write a document. */
export function checkJsonSource(source: string, format = false): JsonCheck {
  if (source.length > JSON_SOURCE_BUDGET.characters) return { valid: false, message: '这份 JSON 较大，暂不检查或整理；全文仍可阅读、查找、编辑和保存。' }
  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : '', text = source.slice(bom.length)
  let error = -1, nodes = 0, depth = 0, maximum = 0
  const tree = parser.parse(text)
  tree.iterate({ enter(node) {
    nodes++
    if (node.type.isError && error < 0) error = node.from
    if (node.name === 'Object' || node.name === 'Array') maximum = Math.max(maximum, ++depth)
  }, leave(node) { if (node.name === 'Object' || node.name === 'Array') depth-- } })
  if (nodes > JSON_SOURCE_BUDGET.tokens || maximum > JSON_SOURCE_BUDGET.depth) return { valid: false, message: '结构过多或嵌套较深，暂不检查或整理；源文与草稿继续保留。' }
  try { JSON.parse(text) } catch { if (error < 0) error = 0 }
  if (error >= 0) {
    const prefix = text.slice(0, error), lines = prefix.split(/\r\n|\r|\n/), line = lines.length, column = Array.from(lines[lines.length - 1] || '').length + 1
    return { valid: false, message: `第 ${line} 行、第 ${column} 列附近有 JSON 语法问题。请核对引号、逗号和括号；未完成的内容仍可保存。`, offset: error + bom.length, line, column }
  }
  if (!format) return { valid: true, message: 'JSON 语法检查通过。这里只检查语法，不检查字段含义或业务规则。' }
  // Preserve every lexical token: large numbers, duplicate keys, escapes and
  // order must survive. JSON.stringify(JSON.parse(source)) would lose them.
  const tokens = text.match(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\],:]|[^\s{}\[\],:]+/g) || []
  const newline = text.match(/\r\n|\r|\n/)?.[0] || '\n', output: string[] = [bom]
  let level = 0, length = bom.length
  const append = (part: string) => { length += part.length; if (length > JSON_SOURCE_BUDGET.formattedBytes) throw new Error('budget'); output.push(part) }
  const indent = () => newline + '  '.repeat(level)
  try {
    tokens.forEach((token, index) => {
      const previous = tokens[index - 1], next = tokens[index + 1]
      if (token === '{' || token === '[') { append(token); level++; if (next !== (token === '{' ? '}' : ']')) append(indent()) }
      else if (token === '}' || token === ']') { level--; if (previous !== (token === '}' ? '{' : '[')) append(indent()); append(token) }
      else if (token === ',') append(',' + indent())
      else if (token === ':') append(': ')
      else append(token)
    })
    append(text.match(/[\t \r\n]*$/)?.[0] || '')
    const formatted = output.join('')
    if (new TextEncoder().encode(formatted).length > JSON_SOURCE_BUDGET.formattedBytes) throw new Error('budget')
    return { valid: true, message: formatted === source ? '当前已经是这份排版，无需修改。' : '排版预览已准备好，尚未修改正文。', formatted }
  } catch { return { valid: true, message: '整理后的排版较大，本次没有修改正文；仍可手动编辑和保存。' } }
}
