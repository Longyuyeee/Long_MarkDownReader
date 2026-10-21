export interface WorkbookListRule { kind: string; showErrorMessage: boolean; formula1?: string; error?: string; allowBlank?: boolean }
// Only literal-list rules are evaluated here; other rules keep their existing semantics.
export function assertWorkbookListValue(input: string, rule?: WorkbookListRule, unchanged = false, formula = input.startsWith('=')): void {
  if (unchanged || !rule?.showErrorMessage || rule.kind !== 'list' || formula || (!input && rule.allowBlank !== false)) return
  const source = rule.formula1 || ''
  if (!source.startsWith('"') || !source.endsWith('"') || source.slice(1, -1).includes('"')) return
  const options = source.slice(1, -1).split(',')
  if (!options.includes(input)) throw Error(rule.error || `请输入列表中的值：${options.join('、')}`)
}
