import { compareTableIntegers, parseTableClipboard, serializeTableClipboard } from './tableEditing'

export const WORKBOOK_CLIPBOARD_LIMITS = { bytes: 10 * 1024 * 1024, cells: 10_000, columns: 256, cellCharacters: 65_534 }
export type ClipboardKind = 'string' | 'number' | 'formula' | 'empty' | 'boolean' | 'error' | 'date' | 'datetime' | 'time'
export interface WorkbookClipboardCell { input: string; kind: ClipboardKind; row: number; column: number }
const kinds = new Set(['string', 'number', 'formula', 'empty', 'boolean', 'error', 'date', 'datetime', 'time'])
const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/
export function isWorkbookNumber(input: string): boolean {
  if (!numeric.test(input) || !Number.isFinite(Number(input))) return false
  const mantissa = input.replace(/^[+-]/, '').split(/[eE]/)[0]
  // Identifiers and values beyond spreadsheet precision remain exact text.
  return !/^0\d/.test(mantissa) && mantissa.replace('.', '').replace(/^0+/, '').length <= 15
}
export function validateWorkbookInput(input: string, kind: ClipboardKind): void {
  if (!kinds.has(kind)) throw Error('不支持的单元格类型，本次未修改')
  if ([...input].length > (kind === 'formula' ? 8192 : 32767)) throw Error(kind === 'formula' ? '公式超过8192字符，本次未修改' : '单元格超过32767字符，本次未修改')
  if (kind === 'formula' && (!input.startsWith('=') || input.length < 2)) throw Error('公式内容无效，本次未修改')
  if (kind === 'number' && (!numeric.test(input) || !Number.isFinite(Number(input)))) throw Error('数字内容无效，本次未修改')
  if (kind === 'empty' && input !== '') throw Error('空单元格内容无效，本次未修改')
  if (kind === 'boolean' && !/^(true|false)$/i.test(input)) throw Error('布尔内容无效，本次未修改')
}
export function compareWorkbookValues(a: string, b: string): number {
  if (!a.trim() || !b.trim()) return a.trim() ? 1 : b.trim() ? -1 : 0
  if (/^[+-]?\d+$/.test(a.trim()) && /^[+-]?\d+$/.test(b.trim())) return compareTableIntegers(a, b)
  if (isWorkbookNumber(a) && isWorkbookNumber(b)) return Number(a) - Number(b)
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
export function workbookSeries(values: string[], offset: number): string {
  // Decimal integer arithmetic prevents 0.1, 0.2 -> 0.30000000000000004.
  if (values.some(value => !isWorkbookNumber(value) || /e/i.test(value))) throw Error('该数字序列无法可靠填充，请分批输入；本次未修改')
  const scale = Math.max(...values.map(value => value.split('.')[1]?.length || 0))
  const integer = (value: string) => { const [whole, fraction = ''] = value.replace(/^[+-]/, '').split('.'); return BigInt((whole || '0') + fraction.padEnd(scale, '0')) * (value.startsWith('-') ? -1n : 1n) }
  const seed = values.map(integer), result = seed[0] + (seed[seed.length - 1] - seed[seed.length - 2]) * BigInt(offset)
  const digits = (result < 0n ? -result : result).toString().padStart(scale + 1, '0')
  const text = (result < 0n ? '-' : '') + (scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits)
  if (!isWorkbookNumber(text)) throw Error('填充结果超过可靠数字精度，本次未修改')
  return text
}
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const checkBytes = (text: string) => { if (text.length > WORKBOOK_CLIPBOARD_LIMITS.bytes || new TextEncoder().encode(text).length > WORKBOOK_CLIPBOARD_LIMITS.bytes) throw Error('剪贴板超过10MiB，请缩小范围；本次未修改') }
export function encodeWorkbookClipboard(cells: WorkbookClipboardCell[][], mode: 'copy' | 'cut' = 'copy'): { text: string; html: string } {
  if (!cells.length || !cells[0].length || cells.length * cells[0].length > WORKBOOK_CLIPBOARD_LIMITS.cells || cells.some(row => row.length !== cells[0].length || row.length > 256)) throw Error('复制范围超过工作簿预算')
  for (const row of cells) for (const cell of row) validateWorkbookInput(cell.input, cell.kind)
  const matrix = cells.map(row => row.map(cell => cell.input))
  // A scalar without delimiters must not acquire literal surrounding quotes.
  const text = cells.length === 1 && cells[0].length === 1 && !/[\t\r\n]/.test(matrix[0][0]) ? matrix[0][0] : serializeTableClipboard(matrix, WORKBOOK_CLIPBOARD_LIMITS)
  const html = `<table data-longedit-workbook="1" data-operation="${mode === 'cut' ? 'cut' : 'copy'}">` + cells.map(row => '<tr>' + row.map(cell => `<td data-kind="${cell.kind}" data-row="${cell.row}" data-column="${cell.column}">${escape(cell.input)}</td>`).join('') + '</tr>').join('') + '</table>'
  checkBytes(text); checkBytes(html)
  return { text, html }
}
export function decodeWorkbookClipboard(text: string, html = ''): { matrix: string[][]; cells?: WorkbookClipboardCell[][]; mode?: 'copy' | 'cut' } {
  const matrix = parseTableClipboard(text, false, WORKBOOK_CLIPBOARD_LIMITS)
  // External HTML is not interpreted. Only our bounded typed envelope is read;
  // it is never inserted into the live DOM, and plain text remains authoritative.
  if (!html.includes('data-longedit-workbook=')) return { matrix }
  checkBytes(html)
  if ([...html.matchAll(/<\/?([a-z][\w:-]*)\b/gi)].some(match => !['html','head','body','meta','table','tbody','tr','td'].includes(match[1].toLowerCase()))) throw Error('剪贴板类型记录包含非表格内容，本次未修改')
  const table = new DOMParser().parseFromString(html, 'text/html').querySelector('table[data-longedit-workbook="1"]')
  const rows = table ? [...table.querySelectorAll(':scope > tbody > tr, :scope > tr')] : []
  if (rows.length !== matrix.length) throw Error('剪贴板类型与文本不一致，本次未修改')
  const cells = rows.map((row, r) => {
    const children = [...row.children]
    if (children.length !== matrix[r].length) throw Error('剪贴板列数不一致，本次未修改')
    return children.map((element, c) => {
      const kind = element.getAttribute('data-kind') as ClipboardKind
      const sourceRow = Number(element.getAttribute('data-row')), column = Number(element.getAttribute('data-column'))
      if (!kinds.has(kind) || !Number.isInteger(sourceRow) || sourceRow < 0 || sourceRow >= 1_048_576 || !Number.isInteger(column) || column < 0 || column >= 16384 || element.textContent?.replace(/\r\n?/g, '\n') !== matrix[r][c].replace(/\r\n?/g, '\n')) throw Error('剪贴板类型记录无效，本次未修改')
      validateWorkbookInput(matrix[r][c], kind)
      return { input: matrix[r][c], kind, row: sourceRow, column }
    })
  })
  return { matrix, cells, mode: table?.getAttribute('data-operation') === 'cut' ? 'cut' : 'copy' }
}
export async function readWorkbookClipboard() {
  // The explicit menu preserves its original plain-text semantics. Keyboard
  // paste uses ClipboardEvent data and never calls the permission-gated read().
  return decodeWorkbookClipboard(await navigator.clipboard.readText())
}
export async function writeWorkbookClipboard(cells: WorkbookClipboardCell[][], mode: 'copy' | 'cut' = 'copy') {
  const { text, html } = encodeWorkbookClipboard(cells, mode)
  if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })])
  else await navigator.clipboard.writeText(text)
}
