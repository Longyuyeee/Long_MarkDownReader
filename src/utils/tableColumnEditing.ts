import {TABLE_HISTORY_BYTES,type EditableTable} from './tableEditing'

export interface ColumnTable extends EditableTable {columnTypes:string[]}
export type TableColumnEdit =
  | {kind:'move';label:string;columnId:string;before:string[];after:string[];bytes:number}
  | {kind:'add';label:string;columnId:string;before:string[];after:string[];header:string;bytes:number}

function checkStructure(table:ColumnTable){
  const count=table.columnIds.length
  if(!count||count!==table.headers.length||count!==table.columnTypes.length||new Set(table.columnIds).size!==count||table.rows.length!==table.rowIds.length||table.rows.some(row=>row.length!==count))throw Error('表格结构已变化，本次未修改')
}
export function planTableColumnMove(table:ColumnTable,columnId:string,direction:-1|1):TableColumnEdit{
  checkStructure(table)
  const index=table.columnIds.indexOf(columnId),target=index+direction
  if(![-1,1].includes(direction)||index<0||target<0||target>=table.columnIds.length)throw Error('该列已在边界，无法继续移动')
  const before=[...table.columnIds],after=[...before];[after[index],after[target]]=[after[target],after[index]]
  const bytes=256+(before.join('').length+after.join('').length+columnId.length)*2
  if(bytes>TABLE_HISTORY_BYTES)throw Error('列结构超过撤销预算，本次未移动')
  return {kind:'move',label:direction<0?'向左移动列':'向右移动列',columnId,before,after,bytes}
}
export function planTableColumnAdd(table:ColumnTable,columnId:string):TableColumnEdit{
  checkStructure(table)
  if(table.columnIds.length>=512)throw Error('已达到512列上限，本次未新增')
  if(!columnId||table.columnIds.includes(columnId))throw Error('新字段标识重复，本次未新增')
  const before=[...table.columnIds],after=[...before,columnId],header=`列 ${after.length}`
  const bytes=256+(before.join('').length+after.join('').length+columnId.length+header.length)*2
  if(bytes>TABLE_HISTORY_BYTES)throw Error('列结构超过撤销预算，本次未新增')
  return {kind:'add',label:'新增列',columnId,before,after,header,bytes}
}
// Validate every row and identity before mutating. Moves retain only column IDs
// in history, rather than taking a second copy of the whole table.
export function applyTableColumnEdit(table:ColumnTable,edit:TableColumnEdit,forward:boolean){
  checkStructure(table)
  const from=forward?edit.before:edit.after,to=forward?edit.after:edit.before
  if(JSON.stringify(table.columnIds)!==JSON.stringify(from)||new Set(to).size!==to.length)throw Error('目标列已变化，未执行任何修改')
  if(edit.kind==='move'){
    const source=from.indexOf(edit.columnId),target=to.indexOf(edit.columnId),expected=[...from]
    if(source<0||Math.abs(source-target)!==1)throw Error('移动目标已变化，本次未修改')
    ;[expected[source],expected[target]]=[expected[target],expected[source]]
    if(JSON.stringify(expected)!==JSON.stringify(to))throw Error('移动顺序已变化，本次未修改')
    const swap=(values:string[])=>{
      ;[values[source],values[target]]=[values[target],values[source]]
    }
    swap(table.headers);swap(table.columnIds);swap(table.columnTypes);for(const row of table.rows)swap(row)
  }else{
    if(edit.after.length!==edit.before.length+1||edit.after[edit.after.length-1]!==edit.columnId||JSON.stringify(edit.after.slice(0,-1))!==JSON.stringify(edit.before))throw Error('新增列身份已变化，本次未修改')
    if(forward){
      if(table.columnIds.includes(edit.columnId)||table.columnIds.length>=512)throw Error('新增列目标已变化，本次未修改')
      table.columnIds.push(edit.columnId);table.headers.push(edit.header);table.columnTypes.push('empty');for(const row of table.rows)row.push('')
    }else{
      const column=table.columnIds.length-1
      if(table.headers[column]!==edit.header||table.rows.some(row=>row[column]!==''))throw Error('新增列仍有修改，请先撤销该列内容；本次未移除')
      table.columnIds.pop();table.headers.pop();table.columnTypes.pop();for(const row of table.rows)row.pop()
    }
  }
}
