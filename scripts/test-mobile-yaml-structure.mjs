import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import { history, undo, redo, isolateHistory } from '@codemirror/commands'
import { inspectYamlStructure, prepareYamlValuePatch, yamlFieldLocation } from '../src/mobile/yamlStructure.ts'
import { sourceFormat, sourceSlice, adoptSourceFormat } from '../src/mobile/sourceFormat.ts'
import { sourceRangeChange } from '../src/mobile/editorOffsets.ts'
const original='\uFEFF# 原注释😎\r\nserver:\n  name: \'yes\' # keep\r\n  count: 900719925474099312345\n  sci: 1.2300e+99\r\nother:\n  name: "\\u4e2d"\r\nlist: [true, -0, null]\n'
const field=(s,label)=>inspectYamlStructure(s).fields.find(f=>f.label===label)
const apply=(s,p)=>s.slice(0,p.from)+p.text+s.slice(p.to)
test('YAML 结构按源码范围区分嵌套同名字段，不将数值或键转为对象',()=>{
 const r=inspectYamlStructure(original);assert.ok(r.fields);const same=r.fields.filter(f=>f.label==='name');assert.equal(same.length,2);assert.notEqual(same[0].id,same[1].id);assert.equal(yamlFieldLocation(r.fields,same[1].id),'文档 1 / other / name');assert.equal(same[1].input,'中');assert.equal(field(original,'count').input,'900719925474099312345');assert.equal(field(original,'sci').input,'1.2300e+99')
})
test('YAML 修改精确范围，字符串保持类型并保留其余原文',()=>{
 for(const input of ['null','true','1e9','a: 2 # inject','[one, two]','中文😎\n换行','!tag &anchor *alias']){
  const f=field(original,'name'),p=prepareYamlValuePatch(original,f.id,'string',input);assert.equal(p.from,f.from);assert.equal(p.to,f.to);assert.equal(p.text,JSON.stringify(input));const result=apply(original,p);assert.equal(field(result,'name').input,input);assert.ok(result.startsWith(original.slice(0,f.from)));assert.ok(result.endsWith(original.slice(f.to)))
 }
})
test('YAML 不变文字、布尔、空值及非十进制数字保留原字面量',()=>{
 for(const [s,k,i]of [["v: 'yes'",'string','yes'],['v: "\\u4e2d"','string','中'],['v: True','boolean','true'],['v: ~','null','null'],['v: 0xFF','number','0xFF'],['v: .nan','number','.nan']]){const p=prepareYamlValuePatch(s,1,k,i);assert.equal(apply(s,p),s)}
})
test('YAML 类型转换及精确十进制数值可用，不接受插入结构的数值',()=>{
 for(const [kind,input,raw]of [['number','-0','-0'],['number','900719925474099312345','900719925474099312345'],['number','1.2300e+99','1.2300e+99'],['boolean','false','false'],['null','','null']]){const p=prepareYamlValuePatch('v: test # c',1,kind,input);assert.equal(p.text,raw);assert.equal(apply('v: test # c',p),`v: ${raw} # c`)}
 for(const v of ['1, other: 2','[1]','1 # comment','&a 1','!tag 1','1\nother: 2','01','0x42'])assert.throws(()=>prepareYamlValuePatch('v: 1',1,'number',v))
})
test('YAML 流式列表和映射中的标点文字被引号保护',()=>{
 const s='v: [{name: foo}, bar] # keep',f=field(s,'name'),p=prepareYamlValuePatch(s,f.id,'string','x, other: [y]');assert.equal(apply(s,p),'v: [{name: "x, other: [y]"}, bar] # keep');assert.equal(inspectYamlStructure(apply(s,p)).fields.length,5)
})
test('YAML 锚点、别名、标签及其内部值只读，别名不展开',()=>{
 const s='plain: ok\nbase: &base {enabled: true}\ncopy: *base\ntagged: !custom {inside: 1}\nrecursive: &self [*self]'
 const fields=inspectYamlStructure(s).fields;assert.ok(fields);assert.equal(fields.filter(f=>f.kind==='alias').length,2);for(const label of ['enabled','copy','inside','recursive']){const f=fields.find(f=>f.label===label);assert.equal(f.editable,false);assert.throws(()=>prepareYamlValuePatch(s,f.id,'string','changed'))}assert.equal(fields.find(f=>f.label==='plain').editable,true)
})
test('YAML 块文本、跨行文字、隐式空值及复杂键范围只读且可定位',()=>{
 for(const s of ['v: |-\n  text\n','v: >\n  text\n','v: "one\n  two"','v:','? [one, two]\n: value','? &k key\n: value']){const r=inspectYamlStructure(s);assert.ok(r.fields,s);for(const f of r.fields.filter(f=>!f.children.length)){assert.equal(f.editable,false,s);assert.ok(f.from>=0&&f.to<=s.length);assert.throws(()=>prepareYamlValuePatch(s,f.id,'string','changed'))}}
})
test('YAML 多文档可分别浏览，版本 1.1 可定位，表单均禁用',()=>{
 for(const s of ['a: 1\n---\na: 2','%YAML 1.1\n---\na: yes']){const r=inspectYamlStructure(s);assert.ok(r.fields);assert.ok(r.fields.every(f=>!f.editable));for(const f of r.fields)assert.throws(()=>prepareYamlValuePatch(s,f.id,'string','changed'))}assert.equal(inspectYamlStructure('a: 1\n---\na: 2').fields[0].children.length,2)
})
test('YAML 非法、重复键、超字段与超输入预算拒绝部分结构和修改',()=>{
 for(const s of ['v: [true','v: 1\nv: 2',Array.from({length:5001},(_,i)=>`k${i}: 0`).join('\n'),'x'.repeat(270000)])assert.equal(inspectYamlStructure(s).fields,undefined)
 assert.throws(()=>prepareYamlValuePatch('v: ok',99,'string','x'));assert.throws(()=>prepareYamlValuePatch('v: ok',1,'string','x'.repeat(16385)))
})
test('YAML 数字键与文字键、空字符串名称和原型名称能分别定位',()=>{
 const s='1: one\n"1": text\n"": empty\n__proto__: safe\nconstructor: safe',r=inspectYamlStructure(s);assert.ok(r.fields);assert.equal(r.fields[1].label,'1（数值键）');assert.equal(r.fields[2].label,'1');for(const f of r.fields.slice(1))assert.equal(apply(s,prepareYamlValuePatch(s,f.id,'string','new')).slice(0,f.from),s.slice(0,f.from))
})
test('YAML 范围事务一次撤销重做恢复 BOM、混合换行和精确数值',()=>{
 let state=EditorState.create({doc:original,extensions:[history(),sourceFormat(original)]});const p=prepareYamlValuePatch(original,field(original,'name').id,'string','false');const expected=apply(original,p)
 state=state.update({...sourceRangeChange(state,original,p.from,p.to,p.text),effects:adoptSourceFormat(expected),annotations:isolateHistory.of('full')}).state;assert.equal(sourceSlice(state),expected)
 const target={get state(){return state},dispatch:tr=>{state=tr.state}};assert.ok(undo(target));assert.equal(sourceSlice(state),original);assert.ok(redo(target));assert.equal(sourceSlice(state),expected)
})
