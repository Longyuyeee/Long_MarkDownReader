import { parseTOML, type AST } from 'toml-eslint-parser'
import { checkTomlSource } from './tomlSource.ts'

export type TomlScalarKind = 'string' | 'integer' | 'float' | 'boolean'
export type TomlKind = TomlScalarKind | 'date' | 'table' | 'inline-table' | 'array' | 'array-tables'
export interface TomlField {
  id: number; parent: number | null; segment: string | number | null; label: string
  kind: TomlKind; from: number; to: number; line: number; column: number
  children: number[]; preview: string; editable: boolean; reason: string; input?: string
}
export interface TomlStructure { fields?: TomlField[]; message: string; offset?: number }
export interface TomlValuePatch { source: string; from: number; to: number; text: string }
export const TOML_STRUCTURE_BUDGET = { fields: 5000, valueCharacters: 16384, page: 30 } as const
export const tomlKindLabel = (kind: TomlKind) => ({ string: '文字', integer: '整数', float: '浮点数', boolean: '布尔值', date: '日期或时间', table: '表', 'inline-table': '内联表', array: '数组', 'array-tables': '表数组' })[kind]
const short = (text: string) => text.length > 160 ? text.slice(0, 160) + '…' : text
const keyNames = (key: AST.TOMLKey) => key.keys.map(part => part.type === 'TOMLBare' ? part.name : part.value)

/** A source-backed logical tree. Resolved AST paths distinguish quoted keys and array-table instances.
 * Never materialize TOML as a JS object or serialize parsed numbers/dates back into source. */
export function inspectTomlStructure(source: string): TomlStructure {
  const checked = checkTomlSource(source)
  if (!checked.valid || !checked.complete) return { message: checked.message, offset: checked.offset }
  try {
    const bom = source.startsWith('\uFEFF') ? 1 : 0, ast = parseTOML(source.slice(bom), { tomlVersion: '1.0.0' })
    // Index once; repeatedly splitting the entire prefix makes large sibling lists quadratic.
    const lines = new Uint32Array(source.length + 1), columns = new Uint32Array(source.length + 1)
    let line = 1, column = 1
    for (let i = bom; i <= source.length;) {
      lines[i] = line; columns[i] = column
      if (i === source.length) break
      const cp = source.codePointAt(i)!, size = cp > 0xffff ? 2 : 1
      if (size === 2) { lines[i + 1] = line; columns[i + 1] = column + 1 }
      if (cp === 13 || cp === 10 && source[i - 1] !== '\r') { line++; column = 1 }
      else if (cp !== 10) column++
      i += size
    }
    const position = (offset: number) => ({ line: lines[offset]!, column: columns[offset]! })
    const fields: TomlField[] = [], byPath = new Map<string, number>()
    function add(path: (string | number)[], kind: TomlKind, from: number, to: number) {
      if (fields.length >= TOML_STRUCTURE_BUDGET.fields) throw new Error('budget')
      const segment = path.length ? path[path.length - 1]! : null
      const parent = path.length ? byPath.get(JSON.stringify(path.slice(0, -1)))! : null, id = fields.length
      if (path.length && parent === undefined) throw new Error('missing parent')
      fields.push({ id, parent, segment, label: segment === null ? 'TOML 配置' : typeof segment === 'number' ? `[${segment}]` : segment, kind, from, to, ...position(from), children: [], preview: '', editable: false, reason: '请选择字段，或前往源码修改。' })
      byPath.set(JSON.stringify(path), id)
      if (parent !== null) fields[parent]!.children.push(id)
      return fields[id]!
    }
    function parents(path: (string | number)[], from: number, to: number) {
      for (let i = 1; i <= path.length; i++) {
        const prefix = path.slice(0, i), existing = byPath.get(JSON.stringify(prefix))
        if (existing === undefined) add(prefix, typeof path[i] === 'number' ? 'array-tables' : 'table', from, to)
      }
    }
    function value(node: AST.TOMLContentNode, path: (string | number)[]) {
      const from = node.range[0] + bom, to = node.range[1] + bom, raw = source.slice(from, to)
      const kind: TomlKind = node.type === 'TOMLArray' ? 'array' : node.type === 'TOMLInlineTable' ? 'inline-table' : ['string', 'integer', 'float', 'boolean'].includes(node.kind) ? node.kind as TomlScalarKind : 'date'
      const field = add(path, kind, from, to)
      field.preview = short(node.type === 'TOMLValue' && node.kind === 'string' ? node.value : raw)
      field.reason = kind === 'date' ? '日期和时间保留原始时区及精度，请前往源码修改。' : node.type === 'TOMLValue' && node.kind === 'string' && (node.multiline || /[\r\n]/.test(raw)) ? '跨行文字请前往源码修改。' : raw.length > TOML_STRUCTURE_BUDGET.valueCharacters ? '这个值较长，请前往源码修改。' : ''
      field.editable = !field.reason && ['string', 'integer', 'float', 'boolean'].includes(kind)
      if (field.editable && node.type === 'TOMLValue') field.input = node.kind === 'string' ? node.value : raw
      if (node.type === 'TOMLArray') node.elements.forEach((child, index) => value(child, [...path, index]))
      else if (node.type === 'TOMLInlineTable') node.body.forEach(pair => assignment(pair, path))
    }
    function assignment(pair: AST.TOMLKeyValue, base: (string | number)[]) {
      const path = [...base, ...keyNames(pair.key)]
      parents(path.slice(0, -1), pair.key.range[0] + bom, pair.key.range[1] + bom)
      value(pair.value, path)
    }
    add([], 'table', bom, source.length)
    for (const node of ast.body[0].body) {
      if (node.type === 'TOMLKeyValue') assignment(node, [])
      else {
        parents(node.resolvedKey, node.range[0] + bom, node.key.range[1] + bom)
        const table = fields[byPath.get(JSON.stringify(node.resolvedKey))!]!
        table.from = node.range[0] + bom; table.to = node.range[1] + bom; Object.assign(table, position(table.from))
        node.body.forEach(pair => assignment(pair, node.resolvedKey))
      }
    }
    for (const field of fields) if (['table', 'inline-table', 'array', 'array-tables'].includes(field.kind)) field.preview = `${field.children.length} 项`
    return { fields, message: '选择字段查看原值，再核对修改。' }
  } catch { return { message: '结构超过本轮浏览范围（最多 5000 项），请使用源码查找；正文仍完整保留。' } }
}

export function tomlFieldLocation(fields: TomlField[], id: number): string {
  const parts: string[] = []; let field: TomlField | undefined = fields[id]
  while (field) { parts.unshift(field.segment === null || typeof field.segment === 'number' ? field.label : /^[A-Za-z0-9_-]+$/.test(field.label) ? field.label : JSON.stringify(field.label)); field = field.parent === null ? undefined : fields[field.parent] }
  return parts.join(' / ')
}

export function prepareTomlValuePatch(source: string, id: number, kind: TomlScalarKind, input: string): TomlValuePatch {
  if (input.length > TOML_STRUCTURE_BUDGET.valueCharacters) throw new Error('输入较长，请前往源码编辑。')
  const before = inspectTomlStructure(source), field = before.fields?.[id]
  if (!field?.editable) throw new Error(field?.reason || '字段位置已变化，请重新浏览结构。')
  const raw = source.slice(field.from, field.to)
  let text: string
  if (kind === field.kind && input === field.input) text = raw
  else if (kind === 'string') text = JSON.stringify(input).replace(/\u007f/g, '\\u007f')
  else if (kind === 'integer' && /^[+-]?(?:0|[1-9]\d*)$/.test(input.trim())) text = input.trim()
  else if (kind === 'float' && /^[+-]?(?:0|[1-9]\d*)(?:\.\d+(?:[eE][+-]?\d+)?|[eE][+-]?\d+)$/.test(input.trim())) text = input.trim()
  else if (kind === 'boolean' && (input === 'true' || input === 'false')) text = input
  else throw new Error('请填写十进制整数、带小数点或指数的浮点数，或选择文字、布尔值。其他写法请在源码中修改。')
  if (text.length > TOML_STRUCTURE_BUDGET.valueCharacters) throw new Error('生成的值较长，请前往源码编辑。')
  const candidate = source.slice(0, field.from) + text + source.slice(field.to), after = inspectTomlStructure(candidate)
  if (!after.fields || after.fields.length !== before.fields!.length) throw new Error('这个值未通过 TOML 1.0 核对，或会改变结构；当前草稿未变。')
  for (const old of before.fields!) {
    const next = after.fields[old.id]!
    if (old.parent !== next.parent || old.segment !== next.segment || old.children.join(',') !== next.children.join(',') || (old.id === id ? next.kind !== kind || !next.editable || kind === 'string' && next.input !== input : old.kind !== next.kind || old.editable && source.slice(old.from, old.to) !== candidate.slice(next.from, next.to))) throw new Error('这个值会改变其他字段或结构，当前草稿未变。')
  }
  return { source, from: field.from, to: field.to, text }
}
