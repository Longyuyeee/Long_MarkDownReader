import { compareDecimals, tableValueIssue } from './tableValidation'

export interface WorkbookEntryRule {
  kind: string; operator?: string; formula1?: string; formula2?: string
  allowBlank: boolean; showErrorMessage: boolean; error?: string
}
export interface WorkbookEntryValue { input: string; kind: string }
export interface WorkbookEntryResult { status: 'valid' | 'invalid' | 'unchecked'; reason: string }
const valid: WorkbookEntryResult = { status: 'valid', reason: '' }
const invalid = (reason: string): WorkbookEntryResult => ({ status: 'invalid', reason })
const unchecked = (reason: string): WorkbookEntryResult => ({ status: 'unchecked', reason })
const numeric = (value: string) => value.length <= 128 && value.trim() === value && Number.isFinite(Number(value)) && compareDecimals(value, value) !== null
const literal = (value?: string) => { const text = (value || '').trim().replace(/^=/, ''); return numeric(text) ? text : null }
const operators: Record<string, string> = { between: '介于', notBetween: '不在区间', equal: '等于', notEqual: '不等于', lessThan: '小于', lessThanOrEqual: '小于或等于', greaterThan: '大于', greaterThanOrEqual: '大于或等于' }
export function workbookRuleLabel(rule: WorkbookEntryRule): string {
  const kind = ({ list: '列表', whole: '整数', decimal: '小数', date: '日期', textLength: '文本长度', custom: '公式' } as Record<string, string>)[rule.kind] || rule.kind
  if (rule.kind === 'list' || rule.kind === 'custom') return `${kind}：${rule.formula1 || '未指定来源'}`
  const op = rule.operator || 'between'
  return `${kind} ${operators[op] || op} ${rule.formula1 || '?'}${['between', 'notBetween'].includes(op) ? ` ～ ${rule.formula2 || '?'}` : ''}`
}
// Calendar values are local worksheet values; never use the host timezone.
export function workbookDateSerial(input: string, date1904 = false): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(input)
  if (!match || tableValueIssue(match[1], { kind: 'date', required: true })) return null
  const [year, month, day] = match[1].split('-').map(Number)
  const hour = Number(match[2] || 0), minute = Number(match[3] || 0), second = Number(match[4] || 0), ms = Number((match[5] || '').padEnd(3, '0'))
  if (hour > 23 || minute > 59 || second > 59) return null
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(0, 0, 0, 0)
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31)
  let days = (date.getTime() - epoch) / 86400000
  if (days < 0) return null
  if (!date1904 && input.slice(0, 10) >= '1900-03-01') days++
  return String(days + (hour * 3600000 + minute * 60000 + second * 1000 + ms) / 86400000)
}
export function checkWorkbookEntry(value: WorkbookEntryValue, rule: WorkbookEntryRule, date1904 = false): WorkbookEntryResult {
  if (!value.input) return rule.allowBlank ? valid : invalid('此单元格不允许留空')
  if (value.kind === 'formula') return unchecked('公式结果需要在电子表格软件中核对')
  let input = value.input
  if (rule.kind === 'list') {
    const source = (rule.formula1 || '').replace(/^=/, '')
    if (!source.startsWith('"') || !source.endsWith('"') || source.slice(1, -1).includes('"')) return unchecked('列表来自区域或名称，需在电子表格软件中核对')
    const options = source.slice(1, -1).split(',')
    return options.includes(input) ? valid : invalid(`请使用列表中的值：${options.join('、')}`)
  }
  if (!['whole', 'decimal', 'date', 'textLength'].includes(rule.kind)) return unchecked('此规则暂不支持自动核对，原规则会保留')
  if (rule.kind === 'textLength') input = String([...input].length)
  else if (rule.kind === 'date') {
    if (['date', 'datetime'].includes(value.kind)) {
      const serial = workbookDateSerial(input, date1904)
      if (serial === null) return invalid('请输入有效日期（YYYY-MM-DD）')
      input = serial
    } else if (value.kind !== 'number' || !numeric(input)) return invalid('请输入日期（YYYY-MM-DD）或工作簿日期序号')
  } else {
    if (value.kind !== 'number' || !numeric(input)) return invalid(rule.kind === 'whole' ? '请输入整数' : '请输入数值')
    if (rule.kind === 'whole' && tableValueIssue(input, { kind: 'integer', required: true })) return invalid('请输入整数')
  }
  const op = rule.operator || 'between', first = literal(rule.formula1), second = literal(rule.formula2)
  if (!operators[op] || first === null || (['between', 'notBetween'].includes(op) && second === null)) return unchecked('边界包含公式、区域或不支持的条件，需在电子表格软件中核对')
  const a = compareDecimals(input, first)!, b = second === null ? 0 : compareDecimals(input, second)!
  const passes = ({ between: a >= 0 && b <= 0, notBetween: a < 0 || b > 0, equal: a === 0, notEqual: a !== 0, lessThan: a < 0, lessThanOrEqual: a <= 0, greaterThan: a > 0, greaterThanOrEqual: a >= 0 } as Record<string, boolean>)[op]
  return passes ? valid : invalid(workbookRuleLabel(rule))
}
export function assertWorkbookEntry(value: WorkbookEntryValue, rules: WorkbookEntryRule[], date1904 = false, unchanged = false): void {
  if (unchanged) return
  for (const rule of rules) {
    if (!rule.showErrorMessage) continue
    const result = checkWorkbookEntry(value, rule, date1904)
    if (result.status === 'invalid') throw Error(rule.error || result.reason)
  }
}
