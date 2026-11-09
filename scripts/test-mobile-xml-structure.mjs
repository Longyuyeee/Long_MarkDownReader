import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inspectXmlStructure, prepareXmlAttribute } from '../src/mobile/xmlStructure.ts'
import { XML_STRUCTURE_BUDGET as B } from '../src/mobile/xmlStructureBudget.ts'
import { xmlPosition } from '../src/mobile/xmlSource.ts'
const source=readFileSync('tests/android-storage-provider/src/main/assets/xml-structure/xml-structure.xml','utf8')
const tree=s=>{const r=inspectXmlStructure(s);assert.ok(r.elements,r.message);return r.elements}
const apply=(s,id,a,input)=>{const r=prepareXmlAttribute(s,id,a,input);assert.ok(r.patch,r.error||r.message);const p=r.patch;assert.equal(p.source,s);return s.slice(0,p.from)+p.text+s.slice(p.to)}
test('XML 词法位置与 DOM 解码对应，重复兄弟和前缀名称保留、CDATA 不制造元素',()=>{
 const e=tree(source);assert.equal(e.length,5);assert.deepEqual(e[0].children,[1,2,4]);assert.equal(e[1].name,'p:item');assert.equal(e[1].occurrence,1);assert.equal(e[2].occurrence,2);assert.equal(e[3].parent,2)
 for(const v of e){assert.equal(source.slice(v.from,v.from+1),'<');assert.deepEqual({line:v.line,column:v.column},xmlPosition(source,v.from));for(const a of v.attributes){assert.match(source[a.from-1],/['"]/);assert.equal(source[a.from-1],source[a.to]);}}
 assert.equal(e[1].attributes[1].value,'A & 中');assert.equal(e[4].attributes[2].value,'');assert.equal(e[4].attributes[3].value,'a  b  c')
})
test('未修改的解码文字保留原实体、引号、制表符、CRLF、BOM 和空属性写法',()=>{
 for(const e of tree(source))for(let i=0;i<e.attributes.length;i++)if(e.attributes[i].editable)assert.equal(apply(source,e.id,i,e.attributes[i].value),source)
})
test('单属性替换只改精确范围，长数字不做数值转换，其他同名属性不受影响',()=>{
 const changed=apply(source,2,0,'000900719925474099312345'),expected=source.replace("id='second'","id='000900719925474099312345'");assert.equal(changed,expected);assert.equal(tree(changed)[1].attributes[0].value,'900719925474099312345');assert.equal(apply(source,4,2,''),source)
})
test('单引号与双引号、实体注入、换行和控制区字符正确转义并还原文字',()=>{
 const input=`a'" & <tag/>\t\r\n😎\u007f\u0085\u2028`
 for(const [id,a]of [[1,0],[1,1],[4,2]]){const changed=apply(source,id,a,input),e=tree(changed);assert.equal(e[id].attributes[a].value,input);const p=prepareXmlAttribute(source,id,a,input).patch;assert.equal(changed.slice(0,p.from),source.slice(0,p.from));assert.equal(changed.slice(p.from+p.text.length),source.slice(p.to));assert.match(p.text,/&amp;/);assert.match(p.text,/&#xD;&#xA;/)}
})
test('命名空间声明保持只读，普通带前缀属性仍可按文字编辑',()=>{
 const s='<p:r xmlns:p="urn:r" xmlns="urn:def" p:value="v" xml:lang="zh"/>',e=tree(s)[0];for(const i of [0,1]){assert.equal(e.attributes[i].editable,false);assert.equal(prepareXmlAttribute(s,0,i,'bad').patch,undefined)}
 assert.equal(tree(apply(s,0,2,'new'))[0].attributes[2].value,'new');assert.equal(tree(apply(s,0,3,'en'))[0].attributes[3].value,'en')
})
test('非法字符、孤立代理项、过长输入、过期元素和属性位置拒绝而不发布补丁',()=>{
 for(const input of ['\0','\ud800','\uffff','x'.repeat(B.valueCharacters+1)])assert.equal(prepareXmlAttribute(source,1,0,input).patch,undefined)
 for(const [id,a]of [[-1,0],[999,0],[1,90],[1.5,0],[1,-1]])assert.equal(prepareXmlAttribute(source,id,a,'new').patch,undefined)
 assert.equal(prepareXmlAttribute('<r bad="x>',0,0,'new').patch,undefined)
})
test('无效、DTD、其他编码和超预算输入无部分可编辑结构；过长属性有明确源码入口',()=>{
 for(const s of ['<r>','<r a="1" a="2"/>','<r xmlns:p="u" xmlns:q="u" p:x="1" q:x="2"/>','<!DOCTYPE r SYSTEM "https://example.invalid"><r/>','<?xml version="1.1"?><r/>','<?xml version="1.0" encoding="UTF-16"?><r/>','<r>'+ '<a/>'.repeat(B.elements)+'</r>','<r '+Array.from({length:257},(_,i)=>`a${i}="v"`).join(' ')+'/>'])assert.equal(inspectXmlStructure(s).elements,undefined)
 const s='<r value="'+'a'.repeat(B.valueCharacters+1)+'"/>';assert.equal(tree(s)[0].attributes[0].editable,false)
})
test('换行列定位和兄弟序号按原源码计算，跨命名空间重新声明保持各自的属性值',()=>{
 const s='\ufeff<r>😎<p:a xmlns:p="urn:one" p:v="1"/><p:a xmlns:p="urn:two" p:v="2"/>\r<a/><a/></r>',e=tree(s);assert.deepEqual(e.map(n=>n.occurrence),[1,1,2,1,2]);for(const n of e)assert.deepEqual({line:n.line,column:n.column},xmlPosition(s,n.from));assert.equal(tree(apply(s,2,1,'three'))[1].attributes[1].value,'1')
})
test('多种文字经过真实解析重检仍逐字一致且元素拓扑不变',()=>{
 for(const input of ['','0','false','null','  spaced  ','&amp;#0;','"><injected a="x','中文😎','a\rb\nc\r\nd\te',String.fromCodePoint(0x10000,0x10ffff)]){const s='<r><x a="before"/><x a="second"/></r>',changed=apply(s,2,0,input),e=tree(changed);assert.equal(e[2].attributes[0].value,input);assert.equal(e[1].attributes[0].value,'before');assert.equal(e.length,3)}
})
