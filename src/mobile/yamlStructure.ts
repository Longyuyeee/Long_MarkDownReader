import { isAlias, isMap, isScalar, isSeq, parseAllDocuments, type Node } from 'yaml'
import { checkYamlSource, yamlPosition } from './yamlSource.ts'

export type YamlScalarKind = 'string' | 'number' | 'boolean' | 'null'
export type YamlKind = YamlScalarKind | 'map' | 'sequence' | 'stream' | 'alias' | 'scalar'
export interface YamlField {
  id: number; parent: number | null; from: number; to: number; kind: YamlKind
  label: string; preview: string; children: number[]; editable: boolean; reason: string
  line: number; column: number; input?: string
}
export interface YamlStructure { fields?: YamlField[]; message: string; offset?: number }
export interface YamlValuePatch { source: string; from: number; to: number; text: string }
export const YAML_STRUCTURE_BUDGET = { fields: 5000, valueCharacters: 16384, page: 30 }
export const yamlKindLabel = (kind: YamlKind) => ({ string: '文字', number: '数值', boolean: '布尔值', null: '空值', map: '映射', sequence: '列表', stream: '多文档', alias: '别名', scalar: '标量' })[kind]
const scalarKind = (node: Node | null): YamlScalarKind | 'scalar' => !isScalar(node) ? 'scalar' : node.value === null ? 'null' : typeof node.value === 'string' ? 'string' : typeof node.value === 'boolean' ? 'boolean' : typeof node.value === 'number' || typeof node.value === 'bigint' ? 'number' : 'scalar'
const short = (text: string) => text.length > 160 ? text.slice(0, 160) + '…' : text
const parsed = (source: string) => parseAllDocuments(source, { strict: true, uniqueKeys: true, intAsBigInt: true, version: '1.2', prettyErrors: false, logLevel: 'silent' })

/** Flat source ranges. Aliases remain leaves; keys never become JS object properties. */
export function inspectYamlStructure(source: string): YamlStructure {
  const checked = checkYamlSource(source)
  if (!checked.valid || !checked.complete) return { message: checked.message, offset: checked.diagnostics.find(d => d.severity === 'error')?.offset }
  const fields: YamlField[] = []
  try {
    const docs = parsed(source)
    function visit(node: Node | null, parent: number | null, label: string, inherited: string, fallback = 0): number {
      if (fields.length >= YAML_STRUCTURE_BUDGET.fields) throw new Error('budget')
      const id = fields.length, from = node?.range?.[0] ?? fallback, to = node?.range?.[1] ?? from
      const raw = source.slice(from, to), kind: YamlKind = isMap(node) ? 'map' : isSeq(node) ? 'sequence' : isAlias(node) ? 'alias' : scalarKind(node)
      const reason = inherited || (!node || !raw ? '隐式空值请在源码中修改。' : isAlias(node) ? '别名保留为引用，请在源码中修改。' : node.anchor || node.tag ? '带锚点或标签的内容请在源码中修改。' : isScalar(node) && (node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED' || /[\r\n]/.test(raw)) ? '块文本或跨行值请在源码中修改。' : raw.length > YAML_STRUCTURE_BUDGET.valueCharacters ? '这个值较长，请在源码中修改。' : '')
      const editable = !reason && ['string', 'number', 'boolean', 'null'].includes(kind)
      const field: YamlField = { id, parent, from, to, kind, label: short(label), preview: short(raw), children: [], editable, reason: reason || (editable ? '' : '请进入字段，或在源码中修改。'), ...yamlPosition(source, from) }
      if (editable) field.input = (kind === 'string' || kind === 'boolean' || kind === 'null') && isScalar(node) ? String(node.value) : raw
      fields.push(field)
      // Only metadata restrictions flow to children, not container length.
      const childReason = inherited || (node && !isAlias(node) && (node.anchor || node.tag) ? '带锚点或标签的内容及其内部值请在源码中修改。' : '')
      if (isMap(node)) node.items.forEach((pair, index) => {
        const key = pair.key as Node | null, simple = isScalar(key) && !key.anchor && !key.tag && !!key.range && key.range[1] > key.range[0] && !/[\r\n]/.test(source.slice(key.range[0], key.range[1]))
        const name = simple ? String(key!.value) + (typeof key!.value === 'string' ? '' : `（${yamlKindLabel(scalarKind(key))}键）`) : `复杂键 #${index + 1}`
        field.children.push(visit(pair.value as Node | null, id, name, childReason || (!simple ? '复杂键或隐式键对应的内容请在源码中修改。' : ''), key?.range?.[1] ?? from))
      })
      else if (isSeq(node)) node.items.forEach((value, index) => field.children.push(visit(value as Node | null, id, `[${index}]`, childReason)))
      if (isMap(node) || isSeq(node)) field.preview = `${field.children.length} 项`
      return id
    }
    if (docs.length !== 1) fields.push({ id: 0, parent: null, from: 0, to: source.length, kind: 'stream', label: '全部文档', preview: `${docs.length} 份文档`, children: [], editable: false, reason: '多文档内容请在源码中修改。', line: 1, column: 1 })
    docs.forEach((doc, index) => {
      const reason = docs.length !== 1 ? '多文档内容请在源码中修改。' : doc.directives?.yaml.version !== '1.2' ? '此文档使用其他 YAML 版本，请在源码中修改。' : ''
      const id = visit(doc.contents, docs.length === 1 ? null : 0, `文档 ${index + 1}`, reason)
      if (docs.length !== 1) fields[0]!.children.push(id)
    })
    return { fields, message: checked.diagnostics.length ? '按层浏览并定位源码；自定义标签等提示请在源码检查中核对。' : '按层浏览并定位源码；普通单行值可核对后修改。' }
  } catch { return { message: '结构超过本轮浏览范围（最多 5000 项），请使用源码查找；正文仍完整保留。' } }
}

export function yamlFieldLocation(fields: YamlField[], id: number): string {
  const parts: string[] = []; let field: YamlField | undefined = fields[id]
  while (field) { parts.unshift(field.label); field = field.parent === null ? undefined : fields[field.parent] }
  return parts.join(' / ')
}
export function prepareYamlValuePatch(source: string, id: number, kind: YamlScalarKind, input: string): YamlValuePatch {
  if (input.length > YAML_STRUCTURE_BUDGET.valueCharacters) throw new Error('输入较长，请前往源码编辑。')
  const before = inspectYamlStructure(source), field = before.fields?.[id]
  if (!field?.editable) throw new Error(field?.reason || '字段位置已变化，请重新浏览结构。')
  const raw = source.slice(field.from, field.to)
  let text: string
  if (kind === field.kind && input === field.input) text = raw
  else if (kind === 'string') text = JSON.stringify(input)
  else if (kind === 'number' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(input.trim())) text = input.trim()
  else if (kind === 'boolean' && (input === 'true' || input === 'false')) text = input
  else if (kind === 'null') text = 'null'
  else throw new Error('请输入十进制数值（可带指数），或选择文字、布尔值、空值。其他写法可在源码中编辑。')
  if (text.length > YAML_STRUCTURE_BUDGET.valueCharacters) throw new Error('生成的值较长，请前往源码编辑。')
  const candidate = source.slice(0, field.from) + text + source.slice(field.to)
  const after = inspectYamlStructure(candidate)
  if (!after.fields || after.fields.length !== before.fields!.length) throw new Error('这个值在当前位置会改变结构，当前草稿未变。')
  for (const old of before.fields!) {
    const next = after.fields[old.id]!
    if (old.parent !== next.parent || old.label !== next.label || old.children.join(',') !== next.children.join(',') || (old.id === id ? next.kind !== kind || !next.editable : old.kind !== next.kind || (!old.children.length && source.slice(old.from, old.to) !== candidate.slice(next.from, next.to)))) throw new Error('这个值会改变其他字段或结构，当前草稿未变。')
  }
  return { source, from: field.from, to: field.to, text }
}
