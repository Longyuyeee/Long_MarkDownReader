import {TABLE_HISTORY_BYTES,type EditableTable} from './tableEditing'

export type TableRowInsertion = 'append' | 'above' | 'below' | 'duplicate'
export interface TableRowInsertEdit {
  kind:'add'; index:number; row:string[]; rowId:string; columnIds:string[]; label?:string
}
export const tableRowHistorySize=(row:string[],columnIds:readonly string[]=[],rowId='',label='')=>
  128+(rowId.length+label.length+columnIds.join('').length)*2+row.reduce((sum,value)=>sum+value.length*2+16,0)

// Work from the current draft and stable row identity. Preflight before touching
// either the data or history, including the column identities retained for undo.
export function planTableRowInsertion(table:EditableTable,action:TableRowInsertion,anchorId:string|undefined,newId:()=>string):TableRowInsertEdit {
  if(!['append','above','below','duplicate'].includes(action))throw Error('未知的行操作')
  if(table.rows.length>=200_000)throw Error('已达到20万行上限，本次未新增')
  if(table.rowIds.length!==table.rows.length||table.columnIds.length!==table.headers.length)throw Error('表格结构已变化，本次未新增')
  const anchor=action==='append'?-1:table.rowIds.indexOf(anchorId||'')
  if(action!=='append'&&anchor<0)throw Error('原记录已变化，请重新打开行菜单')
  const row=action==='duplicate'?table.headers.map((_,column)=>table.rows[anchor][column]??''):Array(table.headers.length).fill('') as string[]
  if(row.some(value=>value.length>1_000_000))throw Error('该行单元格超过100万字符，本次未复制')
  const rowId=newId(),columnIds=[...table.columnIds],label=({above:'上方插入行',below:'下方插入行',duplicate:'复制行',append:undefined})[action]
  if(!rowId||table.rowIds.includes(rowId))throw Error('新记录标识重复，本次未新增')
  if(tableRowHistorySize(row,columnIds,rowId,label)>TABLE_HISTORY_BYTES)throw Error('该行超过8MiB撤销预算，本次未新增')
  return {kind:'add',index:action==='append'?table.rows.length:anchor+(action==='above'?0:1),row,rowId,columnIds,label}
}
