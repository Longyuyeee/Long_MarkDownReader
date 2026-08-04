import fs from 'node:fs'

const source = fs.readFileSync('src/views/TableView.vue', 'utf8')
const fail = message => {
  console.error(message)
  process.exit(1)
}
const requireTokens = tokens => {
  for (const token of tokens) {
    if (!source.includes(token)) fail(`Table row editing token missing: ${token}`)
  }
}

requireTokens([
  '@click="selectRow(item.rowIndex)"',
  ':aria-pressed="table.rowIds[item.rowIndex] === selectedRowId"',
  'requestDeleteSelectedRow',
  'deleteSelectedRow',
  '此操作只会从当前编辑草稿移除该行，点击保存后才会写入源文件。删除后仍可撤销。',
  'rowUndoStack',
  'rowRedoStack',
  'undoRowOperation',
  'redoRowOperation',
  '已撤销删除行',
  "event.key === 'Delete'",
  "event.key.toLowerCase() === 'z'",
  "invoke<TableWriteResult>('write_table_file'",
])

if (/class="row-number"[^>]*title="删除此行"/.test(source)) {
  fail('Row number still presents itself as a destructive action.')
}
if (source.includes('window.confirm(')) {
  fail('Table editor still uses browser confirmation instead of the application dialog service.')
}
if (!/const deleteSelectedRow = \(\) => \{[\s\S]*?table\.value\.rows\.splice[\s\S]*?markDirty\(\)/.test(source)) {
  fail('Selected-row deletion must remain an in-memory dirty edit until explicit save.')
}

console.log('Table row selection, explicit deletion, undo/redo, and save-boundary contract passed.')
