import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import { history, undo, redo, isolateHistory } from '@codemirror/commands'
import { inspectJsonStructure, jsonFieldLocation } from '../src/mobile/jsonStructure.ts'
import { prepareJsonOperation } from '../src/mobile/jsonOperations.ts'
import { findJsonFields } from '../src/mobile/jsonSearch.ts'
import { sourceFormat, sourceSlice, adoptSourceFormat } from '../src/mobile/sourceFormat.ts'
import { sourceRangeChange } from '../src/mobile/editorOffsets.ts'
const fields=s=>inspectJsonStructure(s).fields,apply=(s,id,op)=>{const p=prepareJsonOperation(s,id,op);return s.slice(0,p.from)+p.text+s.slice(p.to)},named=(s,label,n=0)=>fields(s).filter(f=>f.label===label)[n].id
const source='\uFEFF{ "same":1,\r\n"same":-0, "id":900719925474099312345,\n"nested":{"\\u006bey":"中😎 \\u4e2d","arr":[true,false,null,{},[]]}, "__proto__":1 }\r\n'
test('全树查找跨层匹配名称、完整值和解码文字，重复键分开，结果带准确位置',()=>{
 const fs=fields(source);assert.equal(findJsonFields(source,fs,'SAME').total,2);assert.equal(findJsonFields(source,fs,'900719925474099312345').total,1);assert.equal(findJsonFields(source,fs,'中😎 中').total,1)
 const result=findJsonFields(source,fs,'KEY');assert.equal(result.total,1);assert.match(jsonFieldLocation(fs,result.ids[0]),/nested.*key/);assert.match(jsonFieldLocation(fs,named(source,'same',1)),/同名第 2 \/ 2/)
 assert.equal(findJsonFields(source,fs,'.*').total,0);assert.throws(()=>findJsonFields(source,fs,''));assert.throws(()=>findJsonFields(source,fs,'x'.repeat(129)))
})
test('全树查找限制只发布前 200 项但核对总数；很长值的尾部仍能命中',()=>{
 const s='['+Array(1000).fill('"needle"').join(',')+']',r=findJsonFields(s,fields(s),'needle');assert.equal(r.ids.length,200);assert.equal(r.total,1000);assert.equal(r.truncated,true)
 const long='{"x":"'+'a'.repeat(20000)+'TAIL"}';assert.equal(findJsonFields(long,fields(long),'tail').total,1)
})
test('只重命名选中的重复键，未改名称保留转义，阻止新增解码同名键',()=>{
 const changed=apply(source,named(source,'same',1),{action:'rename',name:'新"\\\n😎'});assert.equal(changed,source.replace('"same":-0',JSON.stringify('新"\\\n😎')+':-0'))
 assert.equal(apply(source,named(source,'key'),{action:'rename',name:'key'}),source)
 assert.throws(()=>apply(source,named(source,'same',1),{action:'rename',name:'id'}));assert.throws(()=>apply('{"a":1,"\\u0062":2}',1,{action:'rename',name:'b'}))
 assert.equal(JSON.parse(apply('{"a":1}',1,{action:'rename',name:'__proto__'})).__proto__,1);assert.equal(apply('{"a":1}',1,{action:'rename',name:''}),' {"":1}'.trim())
})
test('对象新增与数组追加只插入新条目，保留已有词法、分隔空白和混合换行',()=>{
 const a={action:'append',name:'new',kind:'number',input:'123456789012345678901234567890e+9999'}
 assert.equal(apply('{"id":900719925474099312345}',0,a),'{"id":900719925474099312345,"new":123456789012345678901234567890e+9999}')
 assert.equal(apply('[1,\r\n  2]',0,{...a,kind:'object'}),'[1,\r\n  2,\r\n  {}]')
 assert.equal(apply('{\r\n}',0,{...a,kind:'array'}),'{\r\n  "new": []\r\n}')
 for(const s of ['{}','{ }','{\r\n  }','[]','[ ]','[\n]','{"a" \n :\t 1 \r,\n"b":2}']){const changed=apply(s,0,{...a,kind:'string',input:'quote"\n😎'});assert.doesNotThrow(()=>JSON.parse(changed));assert.ok(changed.includes(JSON.stringify('quote"\n😎')))}
 assert.equal({}.new,undefined)
})
test('删除对象和数组的首项、中项、末项与唯一项，嵌套容器整体移除且无悬空逗号',()=>{
 for(const [s,results] of [['[ 1, 2, 3 ]',['[ 2, 3 ]','[ 1, 3 ]','[ 1, 2 ]']],['{"a":1, "b":{"x":[1,2]}, "a":-0}',['{"b":{"x":[1,2]}, "a":-0}','{"a":1, "a":-0}','{"a":1, "b":{"x":[1,2]}}']]]){
  const fs=fields(s);for(let i=0;i<3;i++)assert.equal(apply(s,fs[0].children[i],{action:'remove'}),results[i])
 }
 assert.equal(apply('{\r\n "only": {"x":[-0]}\r\n}',1,{action:'remove'}),'{\r\n \r\n}');assert.equal(apply('[ null ]',1,{action:'remove'}),'[  ]')
 assert.throws(()=>apply(source,0,{action:'remove'}))
})
test('数组前后移动交换完整原文，超大数值、重复键、容器混合换行和元素内容不重写',()=>{
 const s='\uFEFF[ {"same":1,\r\n"same":-0},\n  900719925474099312345,\r\n [true,\nfalse] ]\r\n',fs=fields(s),ids=fs[0].children
 const moved=apply(s,ids[1],{action:'move',direction:-1});assert.equal(moved,'\uFEFF[ 900719925474099312345,\n  {"same":1,\r\n"same":-0},\r\n [true,\nfalse] ]\r\n')
 assert.equal(apply(moved,fields(moved)[0].children[0],{action:'move',direction:1}),s)
 assert.throws(()=>apply(s,ids[0],{action:'move',direction:-1}));assert.throws(()=>apply(s,ids[2],{action:'move',direction:1}));assert.throws(()=>apply(source,named(source,'same'),{action:'move',direction:1}))
})
test('新值类型与名称冲突严格验证，原型样式键安全，源文无效或位置过期不产生候选',()=>{
 for(const kind of ['null','boolean','object','array','string','number']){const s=apply('{}',0,{action:'append',name:'__proto__',kind,input:kind==='boolean'?'true':kind==='number'?'-0':'</script>😎'});assert.doesNotThrow(()=>JSON.parse(s))}
 for(const input of ['01','NaN','1,2','[]'])assert.throws(()=>apply('[]',0,{action:'append',name:'',kind:'number',input}))
 assert.throws(()=>apply(source,0,{action:'append',name:'same',kind:'null',input:''}));assert.throws(()=>apply('null',0,{action:'append',name:'x',kind:'null',input:''}));assert.throws(()=>apply('{',0,{action:'remove'}));assert.throws(()=>apply('{}',55,{action:'remove'}));assert.throws(()=>apply('{}',0,{action:'rename',name:'root'}))
})
test('新增候选和名称遵守完整结构预算，不在截断树或超限候选上继续',()=>{
 assert.throws(()=>apply('{}',0,{action:'append',name:'x'.repeat(16385),kind:'null',input:''}))
 const s='['+Array(4999).fill('0').join(',')+']';assert.throws(()=>apply(s,0,{action:'append',name:'',kind:'null',input:''}))
 const deep='['.repeat(64)+']'.repeat(64),fs=fields(deep);assert.throws(()=>apply(deep,fs.length-1,{action:'append',name:'',kind:'array',input:''}))
})
test('真实 CodeMirror 结构操作逐次撤销重做精确保留 BOM、已移动的混合换行和既有历史',()=>{
 const original='\uFEFF[ {"a":1,\r\n"b":2},\n  [3,\r\n4] ]\r\n';let state=EditorState.create({doc:original,extensions:[sourceFormat(original),history()]});const versions=[original]
 for(const op of [{id:1,action:'move',direction:1},{id:0,action:'append',name:'',kind:'string',input:'😎'}]){
  const s=sourceSlice(state),p=prepareJsonOperation(s,op.id,op),next=s.slice(0,p.from)+p.text+s.slice(p.to)
  state=state.update({...sourceRangeChange(state,s,p.from,p.to,p.text),effects:adoptSourceFormat(next),annotations:isolateHistory.of('full'),userEvent:'input.json-structure'}).state;assert.equal(sourceSlice(state),next);versions.push(next)
 }
 const target={get state(){return state},dispatch:transaction=>{state=transaction.state}}
 for(const s of versions.slice(0,-1).reverse()){assert.equal(undo(target),true);assert.equal(sourceSlice(state),s)}
 for(const s of versions.slice(1)){assert.equal(redo(target),true);assert.equal(sourceSlice(state),s)}
})
