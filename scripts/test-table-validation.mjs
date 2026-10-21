import fs from 'node:fs'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import ts from 'typescript'
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64')
const editing=await import(url(fs.readFileSync('src/utils/tableEditing.ts','utf8')))
const m=await import(url(fs.readFileSync('src/utils/tableValidation.ts','utf8').replace("'./tableEditing'",JSON.stringify(url(fs.readFileSync('src/utils/tableEditing.ts','utf8'))))))
const {assertWorkbookListValue:checkList}=await import(url(fs.readFileSync('src/utils/workbookListValidation.ts','utf8')))
test('exact numeric boundaries retain long identifiers, decimal and exponent order',()=>{
 for(const [a,b]of [['9007199254740993123','9007199254740993124'],['0','0.01'],['-0.01','0'],['-100','-2'],['0.1','0.10000000000000001'],['1e2','101']])assert.ok(m.compareDecimals(a,b)<0,[a,b].join('/'))
 assert.equal(m.compareDecimals('00123','123'),0);assert.equal(m.compareDecimals('-0','0'),0)
 assert.equal(m.tableValueIssue('1.0',{kind:'integer',required:false}),'');assert.ok(m.tableValueIssue('1.2',{kind:'integer',required:false}))
})
test('rules check real dates, optional blanks, unicode text and literal options without coercion',()=>{
 const rule={kind:'date',required:true};assert.equal(m.tableValueIssue('2024-02-29',rule),'');for(const date of ['2023-02-29','2026-13-01','0000-01-01'])assert.ok(m.tableValueIssue(date,rule))
 assert.equal(m.tableValueIssue('',{kind:'date',required:false}),'');assert.ok(m.tableValueIssue('',rule))
 assert.equal(m.tableValueIssue('😀字',{kind:'text',required:false,maxLength:2}),'');assert.ok(m.tableValueIssue('😀字A',{kind:'text',required:false,maxLength:2}))
 assert.ok(m.tableValueIssue('123',{kind:'options',required:false,options:['00123']}))
 assert.throws(()=>m.normalizeTableRule({kind:'number',required:false,min:'9007199254740993124',max:'9007199254740993123'}))
 assert.throws(()=>m.normalizeTableRule({kind:'options',required:false,options:[]}))
})
test('correction plans use stable identities, preserve hidden rows and undo exactly',()=>{
 const t={headers:['编号','状态'],columnIds:['id','state'],rowIds:['a','hidden','b'],rows:[['00123','坏'],['9007199254740993123','坏'],['00002','坏']]},old=structuredClone(t),rules={state:{kind:'options',required:true,options:['好']}}
 const issues=[{rowId:'b',columnId:'state',row:2,column:1,value:'坏',reason:'选项'},{rowId:'a',columnId:'state',row:0,column:1,value:'坏',reason:'选项'}],edit=m.planTableCorrection(t,rules,issues,'state','好')
 editing.applyTableEdit(t,edit,true);assert.deepEqual(t.rows,[['00123','好'],old.rows[1],['00002','好']]);editing.applyTableEdit(t,edit,false);assert.deepEqual(t,old)
 t.rows[0][1]='之后的补写';assert.throws(()=>m.planTableCorrection(t,rules,issues,'state','好'));assert.equal(t.rows[0][1],'之后的补写')
})
test('all workbook literal-list entry paths can reject atomically while respecting formulas, blank and unchanged values',()=>{
 const rule={kind:'list',showErrorMessage:true,formula1:'"是,否"',allowBlank:false}
 assert.throws(()=>checkList('非法',rule));assert.throws(()=>checkList('',rule));assert.doesNotThrow(()=>checkList('是',rule));assert.doesNotThrow(()=>checkList('旧非法',rule,true));assert.doesNotThrow(()=>checkList('=A1',rule,false,true))
 assert.doesNotThrow(()=>checkList('',{...rule,allowBlank:true}));assert.doesNotThrow(()=>checkList('任意',{...rule,formula1:'Options!A1:A4'}))
 const draft=[];assert.throws(()=>{const input=['是','非法'];input.forEach(value=>checkList(value,rule));draft.push(...input)});assert.deepEqual(draft,[])
})
