import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import { history, undo, redo, isolateHistory } from '@codemirror/commands'
import { inspectJsonStructure, prepareJsonValuePatch, JSON_STRUCTURE_BUDGET } from '../src/mobile/jsonStructure.ts'
import { sourceFormat, sourceSlice } from '../src/mobile/sourceFormat.ts'
import { sourceRangeChange } from '../src/mobile/editorOffsets.ts'
const source='\uFEFF{ "id":900719925474099312345, "same":1,\r\n"same":-0, "科学":1.2300e+99,\n"字":"读书😎 \\u4e2d", "arr":[true,false,null,{},[]], "__proto__":{"a/b~":"safe"} }\r\n'
const patch=(source,field,kind,input)=>{const p=prepareJsonValuePatch(source,field,kind,input);return source.slice(0,p.from)+p.text+source.slice(p.to)}
test('结构范围保留重复键、大整数与原始数值写法；原型名称安全且不会合并',()=>{
 const {fields}=inspectJsonStructure(source);assert.ok(fields);assert.equal(fields[0].children.length,7)
 const same=fields.filter(f=>f.label==='same');assert.deepEqual(same.map(f=>[f.occurrence,f.siblings]),[[1,2],[2,2]]);assert.notEqual(same[0].id,same[1].id)
 const id=fields.find(f=>f.label==='id');assert.equal(source.slice(id.from,id.to),'900719925474099312345')
 assert.equal(source.slice(same[1].from,same[1].to),'-0');assert.ok(fields.find(f=>f.label==='__proto__'));assert.equal({}.safe,undefined)
 const escaped=inspectJsonStructure('{"a":1,"\\u0061":2}').fields;assert.deepEqual(escaped.filter(f=>f.label==='a').map(f=>f.occurrence),[1,2])
})
test('每种根值、空容器、数组索引、特殊键和源文范围均准确',()=>{
 for(const s of ['null','true','-0','1e99999','"😎"','{}','[]','{"":{},"a/b~":[1,{"q\\\"x":false}]}']){
  const {fields}=inspectJsonStructure(s);assert.ok(fields);assert.equal(fields[0].from,0);assert.equal(fields[0].to,s.length)
  for(const f of fields){assert.doesNotThrow(()=>JSON.parse(s.slice(f.from,f.to)));for(const id of f.children)assert.equal(fields[id].parent,f.id)}
 }
 assert.deepEqual(inspectJsonStructure('[true, false, null]').fields.slice(1).map(f=>f.label),['[0]','[1]','[2]'])
})
test('替换第二个同名字段只影响其值，其余源码和换行逐字符保留',()=>{
 const field=inspectJsonStructure(source).fields.filter(f=>f.label==='same')[1]
 const changed=patch(source,field,'number','123456789012345678901234567890e+9999')
 assert.equal(changed,source.replace('"same":-0','"same":123456789012345678901234567890e+9999'));assert.equal(inspectJsonStructure(changed).fields[0].children.length,7)
})
test('文字编辑处理引号、换行和 emoji；未改文字保留原转义写法',()=>{
 const field=inspectJsonStructure(source).fields.find(f=>f.label==='字');assert.equal(patch(source,field,'string','读书😎 中'),source)
 const input='引号"\\\r\n😎\u0000';const result=patch(source,field,'string',input);assert.equal(JSON.parse(result.slice(1))['字'],input)
 for(const [kind,input] of [['boolean','false'],['null','ignored'],['string','false'],['number','-0']])assert.doesNotThrow(()=>JSON.parse(patch(source,field,kind,input).slice(1)))
})
test('非法数值、复合值及超出字段预算的修改不会产生候选',()=>{
 const field=inspectJsonStructure(source).fields.find(f=>f.label==='id')
 for(const value of ['01','1.','NaN','Infinity','0x1','1,2','1\n2','[1]','{}',''])assert.throws(()=>prepareJsonValuePatch(source,field,'number',value))
 assert.throws(()=>prepareJsonValuePatch(source,field,'boolean','TRUE'));assert.throws(()=>prepareJsonValuePatch(source,{...field,from:-1},'null',''))
 assert.throws(()=>prepareJsonValuePatch(source,field,'string','x'.repeat(JSON_STRUCTURE_BUDGET.valueCharacters+1)))
 assert.throws(()=>prepareJsonValuePatch(source,inspectJsonStructure(source).fields[0],'string','x'))
})
test('无效、过长、过深或字段过多的源文拒绝构建部分树',()=>{
 for(const s of ['{','{"x":}', '[1,]', ' '.repeat(262145),'['.repeat(65)+'0'+']'.repeat(65),'['+Array(5000).fill('0').join(',')+']'])assert.equal(inspectJsonStructure(s).fields,undefined)
 assert.equal(inspectJsonStructure('['+Array(4999).fill('0').join(',')+']').fields.length,5000)
})
test('字段修改是独立历史事务；撤销和重做精确保留 BOM、混合换行及先前编辑',()=>{
 let state=EditorState.create({doc:source,extensions:[sourceFormat(source),history()]})
 const field=inspectJsonStructure(source).fields.find(f=>f.label==='字'),p=prepareJsonValuePatch(source,field,'string','新值😎\n第二行')
 state=state.update({...sourceRangeChange(state,p.source,p.from,p.to,p.text),annotations:isolateHistory.of('full'),userEvent:'input.json-value'}).state
 const expected=source.slice(0,p.from)+p.text+source.slice(p.to);assert.equal(sourceSlice(state),expected)
 const target={get state(){return state},dispatch:transaction=>{state=transaction.state}}
 assert.equal(undo(target),true);assert.equal(sourceSlice(state),source);assert.equal(redo(target),true);assert.equal(sourceSlice(state),expected)
 assert.throws(()=>sourceRangeChange(state,source,p.from,p.to,'null'))
})
