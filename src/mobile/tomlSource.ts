import { parseTOML, ParseError, type AST } from 'toml-eslint-parser'
import { TOML_SOURCE_BUDGET } from './tomlBudget.ts'

export interface TomlCheck { valid: boolean; complete: boolean; message: string; offset?: number; line?: number; column?: number; assignments?: number; tables?: number; arrayTables?: number }
export function tomlPosition(source: string, offset: number) {
  const before = source.slice(source.startsWith('\uFEFF') ? 1 : 0, offset), lines = before.split(/\r\n|\r|\n/)
  return { line: lines.length, column: Array.from(lines[lines.length - 1]!).length + 1 }
}
function children(node: AST.TOMLNode): AST.TOMLNode[] {
  switch (node.type) {
    case 'Program': case 'TOMLTopLevelTable': case 'TOMLInlineTable': return node.body
    case 'TOMLTable': return [node.key, ...node.body]
    case 'TOMLKeyValue': return [node.key, node.value]
    case 'TOMLKey': return node.keys
    case 'TOMLArray': return node.elements
    default: return []
  }
}
/** Inspect a source AST only. Never call getStaticTOMLValue, stringify, or write parsed numbers/dates back. */
export function checkTomlSource(source: string): TomlCheck {
  const at = (message: string, offset: number, complete = true): TomlCheck => ({ valid: false, complete, message, offset, ...tomlPosition(source, offset) })
  const budget = (): TomlCheck => ({ valid: false, complete: false, message: '这份 TOML 超过检查预算，已停止；全文仍可阅读、查找、编辑和保存。' })
  if (source.length > TOML_SOURCE_BUDGET.characters) return budget()
  const bom = source.startsWith('\uFEFF') ? 1 : 0
  for (let i = 0; i < source.length;) {
    const cp = source.codePointAt(i)!
    if (cp >= 0xd800 && cp <= 0xdfff) return at('这处文字不是完整的 Unicode 字符，请核对；当前原文仍可保存。', i)
    i += cp > 0xffff ? 2 : 1
  }
  try {
    // Pin the stable grammar explicitly; the parser's default is experimental 1.1.
    const ast = parseTOML(source.slice(bom), { tomlVersion: '1.0.0' })
    if (ast.tokens.length + ast.comments.length > TOML_SOURCE_BUDGET.nodes) return budget()
    const pending: { node: AST.TOMLNode; depth: number }[] = [{ node: ast, depth: 0 }]
    let nodes = 0, assignments = 0, tables = 0, arrayTables = 0
    while (pending.length) {
      const { node, depth } = pending.pop()!
      if (++nodes > TOML_SOURCE_BUDGET.nodes || depth > TOML_SOURCE_BUDGET.depth || node.type === 'TOMLKey' && node.keys.length > TOML_SOURCE_BUDGET.depth) return budget()
      if (node.type === 'TOMLKeyValue') assignments++
      if (node.type === 'TOMLTable') { tables++; if (node.kind === 'array') arrayTables++; if (node.resolvedKey.length > TOML_SOURCE_BUDGET.depth) return budget() }
      if (node.type === 'TOMLValue' && node.kind === 'integer' && (node.bigint < -9223372036854775808n || node.bigint > 9223372036854775807n)) return at('这个整数超出本轮有符号 64 位检查范围，请在源码中核对；完整数字与草稿继续保留。', node.range[0] + bom, false)
      if (node.type === 'TOMLValue' && node.kind === 'float' && !Number.isFinite(node.value) && !/^[+-]?(?:inf|nan)$/.test(node.number)) return at('这个浮点数超出本轮检查范围，请在源码中核对；原始数值写法仍保留。', node.range[0] + bom, false)
      const nested = children(node)
      for (let i = nested.length - 1; i >= 0; i--) pending.push({ node: nested[i]!, depth: depth + 1 })
    }
    return { valid: true, complete: true, assignments, tables, arrayTables, message: `TOML 1.0 语法检查通过（${assignments} 处赋值，${tables} 个表声明）；配置含义仍由使用它的应用判断。` }
  } catch (error) {
    if (error instanceof ParseError) return at('未通过 TOML 1.0 检查：' + error.message.slice(0, 240) + '。可定位核对；1.1 新语法仍可保留、编辑和保存。', Math.max(bom, Math.min(source.length, error.index + bom)))
    return { valid: false, complete: false, message: '暂时无法完成 TOML 检查，源文与草稿继续保留。' }
  }
}
