import { parser } from '@lezer/json'
import type { SyntaxNode } from '@lezer/common'
import { checkJsonSource } from './jsonSource.ts'

export type JsonValueKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'
export type JsonScalarKind = Exclude<JsonValueKind, 'object' | 'array'>
export interface JsonField {
  id: number; parent: number | null; from: number; to: number; kind: JsonValueKind
  label: string; occurrence: number; siblings: number; preview: string; children: number[]
  keyFrom?: number; keyTo?: number
}
export interface JsonStructure { fields?: JsonField[]; message: string; offset?: number }
export const JSON_STRUCTURE_BUDGET = { fields: 5000, valueCharacters: 16384, page: 30 }
const kinds: Record<string, JsonValueKind> = { Object: 'object', Array: 'array', String: 'string', Number: 'number', True: 'boolean', False: 'boolean', Null: 'null' }
export const jsonKindLabel = (kind: JsonValueKind) => ({ object: '对象', array: '数组', string: '文字', number: '数值', boolean: '布尔值', null: '空值' })[kind]
export const isJsonScalar = (kind: JsonValueKind): kind is JsonScalarKind => kind !== 'object' && kind !== 'array'

/** Source ranges, never a JS object map: duplicate keys and number lexemes survive. */
export function inspectJsonStructure(source: string): JsonStructure {
  const checked = checkJsonSource(source)
  if (!checked.valid) return { message: checked.message, offset: checked.offset }
  const bom = source.startsWith('\uFEFF') ? 1 : 0, fields: JsonField[] = []
  function visit(node: SyntaxNode, parent: number | null, label: string, occurrence = 1, siblings = 1): number {
    if (fields.length >= JSON_STRUCTURE_BUDGET.fields) throw new Error('budget')
    const kind = kinds[node.name]!
    const id = fields.length, from = node.from + bom, to = node.to + bom
    const field: JsonField = { id, parent, from, to, kind, label, occurrence, siblings, children: [], preview: isJsonScalar(kind) ? source.slice(from, Math.min(to, from + 160)) + (to - from > 160 ? '…' : '') : '' }
    fields.push(field)
    if (kind === 'object') {
      const properties: { label: string; value: SyntaxNode; key: SyntaxNode }[] = [], totals = new Map<string, number>(), seen = new Map<string, number>()
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name !== 'Property') continue
        const key = child.getChild('PropertyName')!, value = child.lastChild!
        const name: string = JSON.parse(source.slice(key.from + bom, key.to + bom))
        properties.push({ label: name, value, key }); totals.set(name, (totals.get(name) || 0) + 1)
      }
      for (const item of properties) {
        const nth = (seen.get(item.label) || 0) + 1; seen.set(item.label, nth)
        const child = visit(item.value, id, item.label, nth, totals.get(item.label)!)
        fields[child]!.keyFrom = item.key.from + bom; fields[child]!.keyTo = item.key.to + bom
        field.children.push(child)
      }
    } else if (kind === 'array') {
      for (let child = node.firstChild; child; child = child.nextSibling) if (kinds[child.name]) field.children.push(visit(child, id, `[${field.children.length}]`))
    }
    if (!isJsonScalar(kind)) field.preview = `${field.children.length} 项`
    return id
  }
  try { visit(parser.parse(source.slice(bom)).topNode.firstChild!, null, '根值') }
  catch { return { message: '字段超过本轮结构浏览范围（最多 5000 个），请使用源码查找；正文仍完整保留。' } }
  return { fields, message: '按层浏览，点击字段查看详情；修改后仍需保存到文件。' }
}

export interface JsonValuePatch { source: string; from: number; to: number; text: string }
export function jsonScalarLiteral(kind: JsonScalarKind, input: string): string {
  if (input.length > JSON_STRUCTURE_BUDGET.valueCharacters) throw new Error('输入较长，请前往源码编辑。')
  if (kind === 'string') return JSON.stringify(input)
  if (kind === 'number') {
    const text = input.trim()
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) throw new Error('请输入完整的 JSON 数值，例如 -0 或 1.25e+9；不能有前导零。')
    return text
  }
  if (kind === 'boolean' && (input === 'true' || input === 'false')) return input
  if (kind === 'null') return 'null'
  throw new Error('请选择有效的字段类型与值。')
}
/** Validate only a replacement scalar; never parse/stringify surrounding data. */
export function prepareJsonValuePatch(source: string, field: JsonField, kind: JsonScalarKind, input: string): JsonValuePatch {
  if (!isJsonScalar(field.kind) || !Number.isInteger(field.from) || !Number.isInteger(field.to) || field.from < 0 || field.to <= field.from || field.to > source.length) throw new Error('字段位置已变化，请重新浏览结构。')
  if (input.length > JSON_STRUCTURE_BUDGET.valueCharacters || field.to - field.from > JSON_STRUCTURE_BUDGET.valueCharacters) throw new Error('这个值较长，请前往源码编辑；本次没有修改。')
  const original = source.slice(field.from, field.to)
  const text = kind === 'string' && field.kind === 'string' && JSON.parse(original) === input ? original : jsonScalarLiteral(kind, input)
  return { source, from: field.from, to: field.to, text }
}

export function jsonFieldLocation(fields: JsonField[], id: number): string {
  const parts: string[] = []; let node = fields[id]
  while (node && node.parent !== null) {
    const name = node.label.length > 160 ? node.label.slice(0, 160) + '…' : node.label
    parts.unshift((fields[node.parent]?.kind === 'array' ? name : JSON.stringify(name)) + (node.siblings > 1 ? `（同名第 ${node.occurrence} / ${node.siblings} 项）` : ''))
    node = fields[node.parent]
  }
  return ['根值', ...parts].join(' / ')
}
