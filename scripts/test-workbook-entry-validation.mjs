import fs from 'node:fs'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import ts from 'typescript'
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64')
const table=url(fs.readFileSync('src/utils/tableValidation.ts','utf8').replace("'./tableEditing'",JSON.stringify(url(fs.readFileSync('src/utils/tableEditing.ts','utf8')))))
const {checkWorkbookEntry:check,assertWorkbookEntry:accept,workbookDateSerial:serial}=await import(url(fs.readFileSync('src/utils/workbookEntryValidation.ts','utf8').replace("'./tableValidation'",JSON.stringify(table))))
const rule=(kind,formula1='1',formula2='10',operator='between')=>({kind,formula1,formula2,operator,allowBlank:false,showErrorMessage:true})
test('workbook numeric rules reject text and fractional integers, compare exact long boundaries and all operators',()=>{
 const r=rule('whole');for(const value of [{input:'1.5',kind:'number'},{input:'abc',kind:'string'}])assert.equal(check(value,r).status,'invalid')
 for(const input of ['1','10','1.0','1e1'])assert.equal(check({input,kind:'number'},r).status,'valid')
 assert.equal(check({input:'9007199254740993124',kind:'number'},rule('decimal','9007199254740993123',undefined,'equal')).status,'invalid')
 for(const[op,input,status]of [['notBetween','0','valid'],['equal','1','valid'],['notEqual','1','invalid'],['lessThan','1','invalid'],['lessThanOrEqual','1','valid'],['greaterThan','2','valid'],['greaterThanOrEqual','1','valid']])assert.equal(check({input,kind:'number'},rule('decimal','1','10',op)).status,status)
 assert.equal(check({input:'0.10000000000000001',kind:'number'},rule('decimal','0.1',undefined,'equal')).status,'invalid')
})
test('workbook dates use both calendar epochs, validate calendar and time without local timezone',()=>{
 assert.equal(serial('1900-01-01'),'1');assert.equal(serial('1900-03-01'),'61');assert.equal(serial('1904-01-01',true),'0');assert.equal(serial('1904-01-01 12:00',true),'0.5')
 for(const input of ['2023-02-29','1900-02-29','2026-10-21 24:00','0000-01-01'])assert.equal(serial(input),null)
 const date='2026-10-21',value=serial(date);assert.equal(check({input:date,kind:'date'},rule('date',value,value)).status,'valid');assert.equal(check({input:'2026-10-22',kind:'date'},rule('date',value,value)).status,'invalid')
 assert.equal(check({input:date,kind:'string'},rule('date',value,value)).status,'invalid')
})
test('workbook checks distinguish unknown rules, Unicode length, blanks, advisory and overlapping rules',()=>{
 assert.equal(check({input:'😀字',kind:'string'},rule('textLength','2',undefined,'equal')).status,'valid')
 assert.equal(check({input:'',kind:'empty'},rule('whole')).status,'invalid');assert.equal(check({input:'',kind:'empty'},{...rule('whole'),allowBlank:true}).status,'valid')
 for(const r of [rule('custom','B1>0'),rule('list','Options!A1:A2'),rule('whole','SUM(A1:A2)')])assert.equal(check({input:'2',kind:'number'},r).status,'unchecked')
 assert.equal(check({input:'=A1',kind:'formula'},rule('whole')).status,'unchecked')
 const advisory={...rule('whole'),showErrorMessage:false};assert.equal(check({input:'20',kind:'number'},advisory).status,'invalid');assert.doesNotThrow(()=>accept({input:'20',kind:'number'},[advisory]));assert.throws(()=>accept({input:'20',kind:'number'},[advisory,rule('whole')]))
 assert.doesNotThrow(()=>accept({input:'1.5',kind:'number'},[rule('whole')],false,true))
})
