import { tableEditSize, TABLE_HISTORY_BYTES, type EditableTable, type TableEdit } from './tableEditing'

export interface TableRule { kind: 'any' | 'text' | 'integer' | 'number' | 'date' | 'options'; required: boolean; min?: string; max?: string; maxLength?: number; options?: string[] }
export type TableRules = Record<string, TableRule>
export interface TableIssue { rowId: string; columnId: string; row: number; column: number; value: string; reason: string }
const decimal = (input: string) => {
  if (input.length > 512) return null
  const match = /^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d{1,4}))?$/.exec(input.trim())
  if (!match || Math.abs(Number(match[3] || 0)) > 308) return null
  const raw = match[2].replace('.', '').replace(/^0+/, '')
  if (!raw) return { sign: 0, digits: '0', power: 0 }
  return { sign: match[1] === '-' ? -1 : 1, digits: raw.replace(/0+$/, ''), power: raw.length - (match[2].split('.')[1]?.length || 0) + Number(match[3] || 0) }
}
export function compareDecimals(left: string, right: string): number | null {
  const a = decimal(left), b = decimal(right)
  if (!a || !b) return null
  if (a.sign !== b.sign) return a.sign - b.sign
  if (!a.sign) return 0
  const width = Math.max(a.digits.length, b.digits.length)
  return a.sign * (Math.sign(a.power - b.power) || (a.digits.padEnd(width, '0') < b.digits.padEnd(width, '0') ? -1 : a.digits.padEnd(width, '0') > b.digits.padEnd(width, '0') ? 1 : 0))
}
export function normalizeTableRule(input: TableRule): TableRule {
  if (!['any', 'text', 'integer', 'number', 'date', 'options'].includes(input.kind)) throw Error('请选择支持的录入规则')
  const rule: TableRule = { kind: input.kind, required: !!input.required }
  if (['number', 'integer'].includes(rule.kind)) {
    for (const key of ['min', 'max'] as const) if (input[key]?.trim()) {
      const value = input[key]!.trim()
      if (value.length > 128 || !decimal(value) || !Number.isFinite(Number(value))) throw Error('数值边界无效，请使用有限数值')
      rule[key] = value
    }
    if (rule.min && rule.max && compareDecimals(rule.min, rule.max)! > 0) throw Error('最小值不能大于最大值')
  }
  if (rule.kind === 'text' && input.maxLength !== undefined) {
    if (!Number.isInteger(input.maxLength) || input.maxLength < 1 || input.maxLength > 1_000_000) throw Error('文本长度应为 1–1,000,000 的整数')
    rule.maxLength = input.maxLength
  }
  if (rule.kind === 'options') {
    const options = [...new Set(input.options || [])]
    if (!options.length || options.length > 128 || options.some(value => !value || [...value].length > 255 || /[\r\n]/.test(value))) throw Error('请填写 1–128 个选项，每项一行、最多 255 字符')
    rule.options = options
  }
  return rule
}
export function tableValueIssue(value: string, rule?: TableRule): string {
  if (!rule) return ''
  if (!value.trim()) return rule.required ? '此项必填' : ''
  if (rule.kind === 'text' && rule.maxLength && [...value].length > rule.maxLength) return `最多 ${rule.maxLength} 字符`
  if (rule.kind === 'options' && !rule.options?.includes(value)) return '请使用规则中的选项'
  if (rule.kind === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    const year = Number(match?.[1]), month = Number(match?.[2]), day = Number(match?.[3])
    const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    if (!match || year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return '请输入有效日期（YYYY-MM-DD）'
  }
  if (rule.kind === 'number' || rule.kind === 'integer') {
    const parsed = decimal(value)
    if (!parsed) return '请输入可核对的数值'
    if (rule.kind === 'integer' && parsed.sign && parsed.power < parsed.digits.length) return '请输入整数'
    if (rule.min && compareDecimals(value, rule.min)! < 0) return `不能小于 ${rule.min}`
    if (rule.max && compareDecimals(value, rule.max)! > 0) return `不能大于 ${rule.max}`
  }
  return ''
}
export function planTableCorrection(table: EditableTable, rules: TableRules, issues: TableIssue[], columnId: string, value: string): TableEdit {
  const column = table.columnIds.indexOf(columnId)
  if (column < 0) throw Error('目标字段已变化，请重新检查')
  const reason = tableValueIssue(value, rules[columnId])
  if (reason) throw Error(reason)
  const indices = new Map(table.rowIds.map((id, index) => [id, index]))
  const cells = issues.filter(issue => issue.columnId === columnId).flatMap(issue => {
    const row = indices.get(issue.rowId)
    if (row === undefined || table.rows[row][column] !== issue.value) throw Error('记录已有变化，请重新检查')
    return issue.value === value ? [] : [{ rowId: issue.rowId, columnId, before: issue.value, after: value }]
  })
  if (cells.length > 5000) throw Error('请缩小筛选范围后分批修正')
  const edit: TableEdit = { label: '批量修正', cells, headers: [], appended: [], columnIds: [...table.columnIds], bytes: 0 }
  edit.bytes = tableEditSize(edit)
  if (edit.bytes > TABLE_HISTORY_BYTES) throw Error('修正超过撤销预算，请缩小范围')
  return edit
}
