import { JSON_SOURCE_BUDGET } from './jsonSource.ts'
import { inspectJsonStructure, jsonScalarLiteral, JSON_STRUCTURE_BUDGET, type JsonField, type JsonValueKind, type JsonValuePatch } from './jsonStructure.ts'
export type JsonOperation = { action: 'rename'; name: string } | { action: 'append'; name: string; kind: JsonValueKind; input: string } | { action: 'remove' } | { action: 'move'; direction: -1 | 1 }
const itemStart = (field: JsonField) => field.keyFrom ?? field.from

/** Derive every range again from this exact source, then validate the full candidate. */
export function prepareJsonOperation(source: string, id: number, operation: JsonOperation): JsonValuePatch {
  const analysis = inspectJsonStructure(source), fields = analysis.fields, field = fields?.[id]
  if (!fields || !field) throw new Error(analysis.message || '字段已变化，请重新浏览结构。')
  const parent = field.parent === null ? undefined : fields[field.parent]!, index = parent?.children.indexOf(id) ?? -1
  let from = field.from, to = field.to, text = ''
  const checkName = (name: string, owner: JsonField, exclude?: number) => {
    if (name.length > JSON_STRUCTURE_BUDGET.valueCharacters) throw new Error('字段名较长，请前往源码编辑。')
    if (owner.children.some(child => child !== exclude && fields[child]!.label === name)) throw new Error('这一层已有同名字段，请使用另一个名称。')
  }
  if (operation.action === 'rename') {
    if (!parent || parent.kind !== 'object' || field.keyFrom === undefined || field.keyTo === undefined) throw new Error('只有对象字段可以重命名。')
    from = field.keyFrom; to = field.keyTo
    if (operation.name === field.label) text = source.slice(from, to)
    else { checkName(operation.name, parent, id); text = JSON.stringify(operation.name) }
  } else if (operation.action === 'append') {
    if (field.kind !== 'object' && field.kind !== 'array') throw new Error('请选择对象或数组后再新增。')
    if (field.kind === 'object') checkName(operation.name, field)
    const value = operation.kind === 'object' ? '{}' : operation.kind === 'array' ? '[]' : jsonScalarLiteral(operation.kind, operation.input)
    const children = field.children.map(child => fields[child]!), last = children[children.length - 1], first = children[0]
    const colon = first?.keyTo === undefined ? ': ' : source.slice(first.keyTo, first.from)
    const entry = field.kind === 'object' ? JSON.stringify(operation.name) + colon + value : value
    if (last) {
      from = to = last.to
      // Keep the existing separator style, including mixed line endings and indentation.
      const previous = children[children.length - 2], separator = previous ? source.slice(previous.to, itemStart(last)) : ',' + source.slice(field.from + 1, itemStart(last))
      text = separator + entry
    } else {
      from = to = field.from + 1
      const whitespace = source.slice(from, field.to - 1), newline = whitespace.match(/\r\n|\r|\n/)?.[0]
      const closingIndent = whitespace.match(/(?:\r\n|\r|\n)([\t ]*)$/)?.[1] || ''
      text = (newline ? newline + closingIndent + '  ' : whitespace) + entry
    }
  } else if (operation.action === 'remove') {
    if (!parent || index < 0) throw new Error('根值不能移除，请在源码中修改。')
    if (parent.children.length === 1) { from = itemStart(field); to = field.to }
    else if (index < parent.children.length - 1) { from = itemStart(field); to = itemStart(fields[parent.children[index + 1]!]!) }
    else { from = fields[parent.children[index - 1]!]!.to; to = field.to }
  } else if (operation.action === 'move') {
    if (!parent || parent.kind !== 'array' || ![-1, 1].includes(operation.direction)) throw new Error('只有数组项可以调整位置。')
    const other = fields[parent.children[index + operation.direction]!]
    if (!other) throw new Error('已经到达数组边界。')
    const left = operation.direction === -1 ? other : field, right = operation.direction === -1 ? field : other
    from = left.from; to = right.to
    text = source.slice(right.from, right.to) + source.slice(left.to, right.from) + source.slice(left.from, left.to)
  } else throw new Error('不支持这项结构操作。')
  const candidate = source.slice(0, from) + text + source.slice(to)
  if (candidate.length > JSON_SOURCE_BUDGET.characters) throw new Error('修改后超过结构操作范围，请前往源码编辑；本次没有修改。')
  const checked = inspectJsonStructure(candidate)
  if (!checked.fields) throw new Error('修改后的结构未通过检查：' + checked.message)
  return { source, from, to, text }
}
