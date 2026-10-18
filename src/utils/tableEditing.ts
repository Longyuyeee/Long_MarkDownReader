// Pure, bounded table edits. Planning and validation finish before any mutation.
export const TABLE_CLIPBOARD_BYTES = 2 * 1024 * 1024
export const TABLE_EDIT_CELLS = 20_000
export const TABLE_HISTORY_BYTES = 8 * 1024 * 1024
export interface EditableTable { headers: string[]; rows: string[][]; rowIds: string[]; columnIds: string[] }
export interface CellChange { rowId: string; columnId: string; before: string; after: string }
export function compareTableIntegers(left: string, right: string): number {
 const normalize = (value: string) => { const text = value.trim() || '0', digits = text.replace(/^[+-]/, '').replace(/^0+/, '') || '0'; return { digits, negative: text.startsWith('-') && digits !== '0' } }
 const a = normalize(left), b = normalize(right)
 if (a.negative !== b.negative) return a.negative ? -1 : 1
 return (a.negative ? -1 : 1) * (a.digits.length - b.digits.length || (a.digits < b.digits ? -1 : a.digits > b.digits ? 1 : 0))
}
export interface TableEdit { label: string; cells: CellChange[]; headers: { columnId: string; before: string; after: string }[]; appended: { id: string; values: string[] }[]; columnIds: string[]; bytes: number }
const checkText = (value: string) => { if (value.length > 1_000_000) throw Error('单元格超过100万字符，本次操作未执行') }
export interface ClipboardLimits { bytes: number; cells: number; columns: number; cellCharacters: number }
const tableClipboardLimits: ClipboardLimits = { bytes: TABLE_CLIPBOARD_BYTES, cells: TABLE_EDIT_CELLS, columns: 512, cellCharacters: 1_000_000 }
export function parseTableClipboard(text: string, structured = false, limits: ClipboardLimits = tableClipboardLimits): string[][] {
 if (text.length > limits.bytes || new TextEncoder().encode(text).length > limits.bytes) throw Error(`剪贴板超过${limits.bytes / 1024 / 1024}MiB，请分批粘贴；本次未修改`)
 const checkCell = (value: string) => { if (value.length > limits.cellCharacters) throw Error('单元格文本超过限制，本次未修改') }
 if (!structured && !/[\t\r\n]/.test(text)) { checkCell(text); return [[text]] }
 const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false
 const field = () => { checkCell(cell); row.push(cell); cell = ''; closed = false; if (row.length > limits.columns) throw Error(`粘贴超过${limits.columns}列，本次未修改`) }
 const record = () => { field(); rows.push(row); row = []; if (rows.length > limits.cells) throw Error(`粘贴超过${limits.cells.toLocaleString()}格，请分批操作`) }
 for (let i = 0; i < text.length; i++) {
  const c = text[i]
  if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else { quoted = false; closed = true } } else cell += c; continue }
  if (c === '\t') { field(); continue }
  if (c === '\r' || c === '\n') { if (c === '\r' && text[i + 1] === '\n') i++; record(); continue }
  if (closed) throw Error('剪贴板引号格式不完整，本次未修改')
  if (c === '"' && !cell) quoted = true; else cell += c
 }
 if (quoted) throw Error('剪贴板中有未闭合引号，本次未修改')
 if (cell || row.length || !rows.length || !/[\r\n]$/.test(text)) record()
 const width = Math.max(...rows.map(value => value.length))
 if (rows.length * width > limits.cells) throw Error(`粘贴超过${limits.cells.toLocaleString()}格，请分批操作`)
 return rows.map(value => [...value, ...Array(width - value.length).fill('')])
}
export function serializeTableClipboard(rows: string[][], limits: ClipboardLimits = tableClipboardLimits): string {
 let length = 0
 for (const row of rows) for (const value of row) { length += value.length + 1; if (length > limits.bytes) throw Error(`复制内容超过${limits.bytes / 1024 / 1024}MiB，请缩小选区`) }
 const text = rows.map(row => row.map(value => /[\t\r\n"]/.test(value) ? '"' + value.split('"').join('""') + '"' : value).join('\t')).join('\r\n')
 if (new TextEncoder().encode(text).length > limits.bytes) throw Error(`复制内容超过${limits.bytes / 1024 / 1024}MiB，请缩小选区`)
 return text
}
export const tableEditSize = (edit: Pick<TableEdit, 'cells' | 'headers' | 'appended' | 'columnIds'>) => 256 + edit.columnIds.join('').length * 2
 + edit.cells.reduce((sum, cell) => sum + 96 + (cell.rowId.length + cell.columnId.length + cell.before.length + cell.after.length) * 2, 0)
 + edit.headers.reduce((sum, cell) => sum + 64 + (cell.columnId.length + cell.before.length + cell.after.length) * 2, 0)
 + edit.appended.reduce((sum, row) => sum + 64 + row.id.length * 2 + row.values.reduce((size, value) => size + 16 + value.length * 2, 0), 0)
export function planTablePaste(table: EditableTable, visibleIds: string[], rowId: string, columnId: string, values: string[][], allowAppend: boolean, id: () => string): TableEdit {
 const startRow = visibleIds.indexOf(rowId), startColumn = table.columnIds.indexOf(columnId), width = values[0]?.length || 0
 if (startRow < 0 || startColumn < 0 || !width || !values.length || values.some(row => row.length !== width)) throw Error('粘贴目标已变化，请重新选择')
 if (values.length * width > TABLE_EDIT_CELLS) throw Error('单次最多20,000格，请分批操作')
 if (startColumn + width > table.headers.length) throw Error('粘贴超出现有列，请先用“＋ 列”补足；本次未修改')
 const extra = Math.max(0, startRow + values.length - visibleIds.length)
 if (extra && !allowAppend) throw Error('粘贴超出筛选或排序后的可见行，请先调整范围；本次未修改')
 if (table.rows.length + extra > 200_000 || extra * table.headers.length > TABLE_EDIT_CELLS) throw Error('新增行超过容量预算，请分批操作；本次未修改')
 const indices = new Map(table.rowIds.map((value, index) => [value, index]))
 const edit: TableEdit = { label: '粘贴', cells: [], headers: [], appended: [], columnIds: [...table.columnIds], bytes: 0 }
 for (let r = 0; r < values.length; r++) {
  values[r].forEach(checkText)
  const targetId = visibleIds[startRow + r]
  if (targetId !== undefined) {
   const target = indices.get(targetId); if (target === undefined) throw Error('目标行已变化，本次未修改')
   for (let c = 0; c < width; c++) { const before = table.rows[target][startColumn + c] ?? '', after = values[r][c]; if (before !== after) edit.cells.push({ rowId: targetId, columnId: table.columnIds[startColumn + c], before, after }) }
  } else { const row = Array(table.headers.length).fill(''); for (let c = 0; c < width; c++) row[startColumn + c] = values[r][c]; edit.appended.push({ id: id(), values: row }) }
 }
 edit.bytes = tableEditSize(edit)
 if (edit.bytes > TABLE_HISTORY_BYTES) throw Error('本次修改超过8MiB撤销预算，请缩小范围；本次未修改')
 return edit
}
export function applyTableEdit(table: EditableTable, edit: TableEdit, forward: boolean): void {
 const needed = [...new Set([...edit.cells.map(cell => cell.rowId), ...edit.appended.map(row => row.id)])]
 const rows = needed.length <= 8 ? new Map(needed.map(id => [id, table.rowIds.indexOf(id)]).filter(([, index]) => Number(index) >= 0) as [string, number][]) : new Map(table.rowIds.map((id, i) => [id, i]))
 const columns = new Map(table.columnIds.map((id, i) => [id, i]))
 const from = forward ? 'before' : 'after', to = forward ? 'after' : 'before'
 for (const cell of edit.cells) { const r = rows.get(cell.rowId), c = columns.get(cell.columnId); if (r === undefined || c === undefined || table.rows[r][c] !== cell[from]) throw Error('撤销目标或内容已变化，未执行任何修改') }
 for (const header of edit.headers) { const c = columns.get(header.columnId); if (c === undefined || table.headers[c] !== header[from]) throw Error('表头已变化，未执行任何修改') }
 if (edit.columnIds.some(id => !columns.has(id))) throw Error('目标列已变化，未执行任何修改')
 const appendedIds = new Set<string>()
 for (const row of edit.appended) {
  if (appendedIds.has(row.id)) throw Error('新增行身份重复，未执行任何修改'); appendedIds.add(row.id)
  if (forward) { if (rows.has(row.id)) throw Error('新增行身份已存在，未执行任何修改') }
  else { const r = rows.get(row.id); if (r === undefined || table.columnIds.some((id, c) => table.rows[r][c] !== (row.values[edit.columnIds.indexOf(id)] ?? ''))) throw Error('新增行已变化，不能直接移除；本次未修改') }
 }
 // No throwing operations after this point. All identity/value checks above are atomic.
 for (const cell of edit.cells) table.rows[rows.get(cell.rowId)!][columns.get(cell.columnId)!] = cell[to]
 for (const header of edit.headers) table.headers[columns.get(header.columnId)!] = header[to]
 if (forward) for (const row of edit.appended) { table.rows.push(table.columnIds.map(id => row.values[edit.columnIds.indexOf(id)] ?? '')); table.rowIds.push(row.id) }
 else for (const row of [...edit.appended].reverse()) { const index = table.rowIds.indexOf(row.id); table.rows.splice(index, 1); table.rowIds.splice(index, 1) }
}
