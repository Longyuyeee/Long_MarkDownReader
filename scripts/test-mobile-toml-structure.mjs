import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import { history, undo, redo, isolateHistory } from '@codemirror/commands'
import { inspectTomlStructure, prepareTomlValuePatch, tomlFieldLocation } from '../src/mobile/tomlStructure.ts'
import { sourceFormat, sourceSlice, adoptSourceFormat } from '../src/mobile/sourceFormat.ts'
import { sourceRangeChange } from '../src/mobile/editorOffsets.ts'
const original='\uFEFF# 原注释😎\r\ntitle = "Long编辑"\n[server]\r\nname = \'yes\' # keep\ncount = 9223372036854775807\r\nsci = 1.2300e+99\n"a.b" = "\\u4e2d"\r\na.b = true\nlist = [true, -0, {name="inside"}]\r\n[other]\nname="other"\r\n'
const fields=s=>{const r=inspectTomlStructure(s);assert.ok(r.fields,r.message);return r.fields}
const field=(s,label)=>fields(s).find(f=>f.label===label)
const apply=(s,p)=>s.slice(0,p.from)+p.text+s.slice(p.to)
test('TOML 按逻辑路径浏览点号、引号键、内联表和精确数值',()=>{
 const all=fields(original),same=all.filter(f=>f.label==='name');assert.equal(same.length,3);assert.equal(tomlFieldLocation(all,same[2].id),'TOML 配置 / other / name');assert.equal(field(original,'count').input,'9223372036854775807');assert.equal(field(original,'sci').input,'1.2300e+99');assert.equal(tomlFieldLocation(all,field(original,'a.b').id),'TOML 配置 / server / "a.b"');assert.equal(field(original,'a.b').input,'中');assert.ok(all.some(f=>tomlFieldLocation(all,f.id)==='TOML 配置 / server / a / b'))
})
test('TOML 表数组与子表使用已解析实例路径，同名字段不串位',()=>{
 const s='[[products]]\nname="a"\n[products.meta]\nid=1\n[[products]]\nname="b"\n[products.meta]\nid=2',all=fields(s),ids=all.filter(f=>f.label==='id');assert.equal(ids.length,2);assert.equal(tomlFieldLocation(all,ids[1].id),'TOML 配置 / products / [1] / meta / id');const p=prepareTomlValuePatch(s,ids[1].id,'integer','3');assert.equal(apply(s,p),s.replace('id=2','id=3'));assert.equal(all.find(f=>f.label==='products').kind,'array-tables')
})
test('TOML 后声明的父表与隐式表合并，空表与空配置可以浏览',()=>{
 const all=fields('[a.b]\nx=1\n[a]\ny=2');assert.equal(all.filter(f=>f.label==='a').length,1);assert.equal(all.find(f=>f.label==='a').children.length,2);assert.equal(fields('[empty]')[1].children.length,0);assert.equal(fields('# comment only\n').length,1)
})
test('TOML 源码位置按 Unicode 字符计列，BOM 和 CRLF 不重复计行',()=>{
 const all=fields('\uFEFF"😎" = 1\r\nv = { "😎" = 2, x = 3 }\nnext=true'),one=all.find(f=>f.input==='1'),three=all.find(f=>f.input==='3');assert.equal(one.line,1);assert.equal(one.column,7);assert.equal(three.line,2);assert.equal(three.column,20);assert.equal(all.find(f=>f.label==='next').line,3)
})
test('TOML 文字使用引号保护符号、控制字符、换行和 Unicode',()=>{
 const f=field(original,'name');for(const input of ['null','true','1e9','a = 2 # inject','[one, two]','中文😎\n换行','\t\b\f\u0000','"\\','\u007f']){const p=prepareTomlValuePatch(original,f.id,'string',input),next=apply(original,p);assert.equal(p.from,f.from);assert.equal(p.to,f.to);assert.equal(field(next,'name').input,input);assert.equal(next.slice(0,p.from),original.slice(0,p.from));assert.equal(next.slice(p.from+p.text.length),original.slice(p.to))}
 assert.throws(()=>prepareTomlValuePatch(original,f.id,'string','\ud800'))
})
test('TOML 不变文字、进制、正负零、特殊浮点及转义保留原字面量',()=>{
 for(const [s,k,i] of [["v='yes'",'string','yes'],['v="\\u4e2d"','string','中'],['v=0xFF','integer','0xFF'],['v=1_000','integer','1_000'],['v=+0','integer','+0'],['v=-0','integer','-0'],['v=+nan','float','+nan'],['v=-inf','float','-inf']])assert.equal(apply(s,prepareTomlValuePatch(s,1,k,i)),s)
})
test('TOML 类型转换与完整十进制数值，不接受结构注入或越界数值',()=>{
 for(const[k,input]of [['integer','-0'],['integer','9223372036854775807'],['integer','-9223372036854775808'],['float','1.2300e+99'],['boolean','false']]){const p=prepareTomlValuePatch('v="text" # c',1,k,input);assert.equal(p.text,input);assert.equal(apply('v="text" # c',p),`v=${input} # c`)}
 for(const input of ['1, other=2','[1]','1 # comment','1\nother=2','01','0x42','9223372036854775808','-9223372036854775809'])assert.throws(()=>prepareTomlValuePatch('v=1',1,'integer',input));for(const input of ['1','nan','inf','1e999','1.0 # hi'])assert.throws(()=>prepareTomlValuePatch('v=1.0',1,'float',input))
})
test('TOML 内联表与混合数组中的值修改不改变周围结构',()=>{
 const s='v=[{name="old", count=1}, true, 2] # keep',f=field(s,'name'),p=prepareTomlValuePatch(s,f.id,'string','x, new = [y]');assert.equal(apply(s,p),'v=[{name="x, new = [y]", count=1}, true, 2] # keep');assert.equal(fields(apply(s,p)).length,fields(s).length)
})
test('TOML 日期、跨行文本与容器只读，保留原时区、精度和定位',()=>{
 for(const s of ['v=1979-05-27T07:32:00.123456789-07:00','v=07:32:00.123456789',"v='''text'''",'v="""one\ntwo"""','v=[]','v={}']){const f=field(s,'v');assert.equal(f.editable,false,s);assert.ok(f.from>=0&&f.to<=s.length);assert.throws(()=>prepareTomlValuePatch(s,f.id,'string','new'))}
})
test('TOML 非法、1.1 语法、超输入或字段预算不发布部分结构',()=>{
 for(const s of ['v=[1','v=1\nv=2','v={a=1,}',Array.from({length:5001},(_,i)=>`k${i}=0`).join('\n'),'x'.repeat(270000)])assert.equal(inspectTomlStructure(s).fields,undefined,s.slice(0,80));assert.throws(()=>prepareTomlValuePatch('v=1',99,'integer','1'));assert.throws(()=>prepareTomlValuePatch('v="a"',1,'string','x'.repeat(16385)))
})
test('TOML 原型、空名称、文字数字与路径分隔符保持独立身份',()=>{
 const s='__proto__="safe"\nconstructor="safe"\n""=1\n"0"=2\n"a / b"=3\n"a.b"=4\na.b=5',all=fields(s);assert.equal(all.length,9);assert.equal(tomlFieldLocation(all,all.find(f=>f.label==='a / b').id),'TOML 配置 / "a / b"');assert.equal(field(s,'').input,'1');assert.equal(apply(s,prepareTomlValuePatch(s,field(s,'__proto__').id,'string','changed')),s.replace('"safe"','"changed"'))
})
test('TOML 大容器中的普通短值仍可修改，超长值只读',()=>{
 const s='v="'+ 'x'.repeat(16400)+'"\na=[1,2]\n';assert.equal(field(s,'v').editable,false);assert.equal(fields(s).find(f=>f.label==='[1]').editable,true)
})
test('TOML 精确范围一次应用、撤销和重做保留 BOM、混合换行及原排版',()=>{
 const f=field(original,'count'),p=prepareTomlValuePatch(original,f.id,'integer','12');let state=EditorState.create({doc:original,extensions:[history(),sourceFormat(original)]});const dispatch=tr=>{state=tr.state};dispatch(state.update({...sourceRangeChange(state,p.source,p.from,p.to,p.text),effects:adoptSourceFormat(apply(original,p)),annotations:isolateHistory.of('full'),userEvent:'input.source-value'}));assert.equal(sourceSlice(state),apply(original,p));assert.equal(undo({state,dispatch}),true);assert.equal(sourceSlice(state),original);assert.equal(redo({state,dispatch}),true);assert.equal(sourceSlice(state),apply(original,p))
})
