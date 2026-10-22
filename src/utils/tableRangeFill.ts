import { tableEditSize, TABLE_EDIT_CELLS, TABLE_HISTORY_BYTES, type EditableTable, type TableEdit } from './tableEditing'
import { tableValueIssue, type TableRules } from './tableValidation'

export interface TableCellRange { rows: string[]; columns: string[] }
export type TableFillMode = 'empty' | 'replace'

// Plan using captured row/column identities, never visible offsets or a repeated
// clipboard matrix. Finish all validation and budget checks before any mutation.
export function planTableRangeFill(table: EditableTable, rules: TableRules, range: TableCellRange, value: string, mode: TableFillMode): TableEdit {
  if (!['empty', 'replace'].includes(mode) || !range.rows.length || !range.columns.length
    || new Set(range.rows).size !== range.rows.length || new Set(range.columns).size !== range.columns.length) throw Error('选区已变化，请重新选择')
  if (range.rows.length * range.columns.length > TABLE_EDIT_CELLS) throw Error('单次最多20,000格，请缩小选区')
  if (value.length > 1_000_000) throw Error('填充内容超过100万字符，本次未修改')
  const rows = new Map(table.rowIds.map((id, index) => [id, index]))
  const columns = new Map(table.columnIds.map((id, index) => [id, index]))
  const edit: TableEdit = {label:'填充选区',cells:[],headers:[],appended:[],columnIds:[...table.columnIds],bytes:0}
  let bytes = tableEditSize(edit)
  for (const rowId of range.rows) {
    const row = rows.get(rowId)
    if (row === undefined) throw Error('选区行已变化，请重新选择')
    for (const columnId of range.columns) {
      const column = columns.get(columnId)
      if (column === undefined) throw Error('选区列已变化，请重新选择')
      const before = table.rows[row]![column] ?? ''
      // Spaces and leading zeroes are authored content, not empty cells.
      if ((mode === 'empty' && before !== '') || before === value) continue
      const issue = tableValueIssue(value, rules[columnId])
      if (issue) throw Error(`第 ${row + 1} 行“${table.headers[column] || `第 ${column + 1} 列`}”：${issue}；本次未修改`)
      bytes += 96 + (rowId.length + columnId.length + before.length + value.length) * 2
      if (bytes > TABLE_HISTORY_BYTES) throw Error('填充超过8MiB撤销预算，请缩小范围；本次未修改')
      edit.cells.push({rowId,columnId,before,after:value})
    }
  }
  edit.bytes = tableEditSize(edit)
  return edit
}
