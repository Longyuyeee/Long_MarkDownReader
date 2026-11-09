import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkXmlSource, xmlPosition } from '../src/mobile/xmlSource.ts'
import { XML_SOURCE_BUDGET } from '../src/mobile/xmlBudget.ts'
import { importedFileName, importedCopyName, decodeImportedText } from '../src/mobile/textImport.ts'
import { textExportName, captureTextExport } from '../src/mobile/textExport.ts'
const source=readFileSync('tests/android-storage-provider/src/main/assets/xml-source/xml-source.xml','utf8')
test('XML 注释、CDATA、处理指令、命名空间、BOM、精确属性和混合换行可检查且不改字节',()=>{
 const before=Buffer.from(source),r=checkXmlSource(source);assert.equal(r.valid,true);assert.equal(r.complete,true);assert.equal(r.elements,4);assert.equal(r.attributes,4);assert.deepEqual(Buffer.from(source),before)
})
test('XML 引号、结束标签、根元素、裸 & 和重复属性错误不会被容错修复为通过',()=>{
 for(const s of ['', 'text','<a/><b/>','<a><b></a>','<a>','<a x=foo/>','<a x="1" x="2"/>','<a>&unknown;</a>','<a>&</a>','<a x="x<y"/>','<a><!-- bad -- comment --></a>']){const r=checkXmlSource(s);assert.equal(r.valid,false,s);assert.equal(r.complete,true,s);assert.ok(r.offset>=0&&r.offset<=s.length,s)}
})
test('XML1.0 原始非法字符、孤立代理项和非法字符引用会拒绝，CDATA 中的引用文字不误判',()=>{
 for(const s of ['<a>\u0001</a>','<a>\ud800</a>','<a>&#0;</a>','<a a="&#xD800;"/>','<a>&#x110000;</a>','<a>&#xFFFE;</a>'])assert.equal(checkXmlSource(s).valid,false,s)
 for(const s of ['<a>&#9;&#10;&#13;&#x1F60E;</a>','<a>😎\u0085</a>','<a><![CDATA[&#0; <!DOCTYPE fake>]]></a>','<!-- <!DOCTYPE fake> --><a x="&amp;#0;"/>'])assert.equal(checkXmlSource(s).valid,true,s)
})
test('XML 检查命名空间绑定、保留前缀与展开名称重复，不只比较属性拼写',()=>{
 for(const s of ['<p:a/>','<a xmlns:p="urn:x" xmlns:q="urn:x" p:v="1" q:v="2"/>','<a xmlns:xml="urn:bad"/>','<a xmlns:p="http://www.w3.org/XML/1998/namespace"/>','<a xmlns:xmlns="urn:x"/>','<a xmlns:p=""/>'])assert.equal(checkXmlSource(s).valid,false,s)
 for(const s of ['<p:a xmlns:p="urn:x"/>','<a xmlns="urn:x" xmlns:p="urn:x" v="1" p:v="2"/>','<a xml:lang="zh"/>'])assert.equal(checkXmlSource(s).valid,true,s)
})
test('XML DOCTYPE / 外部实体 / 递归实体明确不检查，XML1.1 与其他编码保留源码',()=>{
 for(const s of ['<!DOCTYPE a SYSTEM "https://example.invalid/x"><a/>','<!DOCTYPE a [<!ENTITY x SYSTEM "file:///secret">]><a>&x;</a>','<!DOCTYPE a [<!ENTITY a "&a;&a;">]><a>&a;</a>','<?xml version="1.1"?><a/>','<?xml version="1.0" encoding="UTF-16"?><a/>']){const r=checkXmlSource(s);assert.equal(r.valid,false);assert.equal(r.complete,false);assert.ok(r.message.includes('源码')||r.message.includes('编码'))}
})
test('XML 超长、过深和超分析节点预算不发布通过结果',()=>{
 for(const s of ['<a>'+ 'x'.repeat(XML_SOURCE_BUDGET.characters)+'</a>','<a>'.repeat(65)+'</a>'.repeat(65),'<r>'+'<a/>'.repeat(9000)+'</r>']){const r=checkXmlSource(s);assert.equal(r.valid,false);assert.equal(r.complete,false);assert.match(r.message,/预算/)}
})
test('XML 错误位置保留原始 CRLF 源偏移和 Unicode 列，补齐缺失结束标签能检查通过',()=>{
 const s=readFileSync('tests/android-storage-provider/src/main/assets/xml-source/xml-invalid.xml','utf8'),r=checkXmlSource(s);assert.equal(r.valid,false);assert.equal(r.offset,s.length);assert.equal(checkXmlSource(s+'</root>').valid,true);const invalid='\uFEFF<a>😎\r\n&#0;</a>',found=checkXmlSource(invalid);assert.equal(found.offset,invalid.indexOf('&#'));assert.equal(found.line,2);assert.equal(found.column,1);assert.deepEqual(xmlPosition('\uFEFF<a>😎',6),{line:1,column:5})
})
test('XML 导入副本与导出保持 xml 扩展名、BOM 和未完成原文',()=>{
 const id='01234567-89ab-cdef-0123-456789abcdef',unfinished=source+'<!-- note';assert.equal(importedFileName('配置.XML'),'配置.xml');for(const mime of ['application/xml','text/xml'])assert.equal(importedFileName('',mime),'导入文档.xml');assert.equal(importedCopyName('配置.XML',id),'配置-导入-'+id+'.xml');assert.equal(textExportName('目录/配置.XML'),'配置-导出副本.xml');assert.equal(decodeImportedText(Buffer.from(unfinished)),unfinished);assert.equal(captureTextExport({rootId:'local',relativePath:'配置.xml',content:unfinished,expectedSignature:null,revision:1,dirty:true}).content,unfinished);assert.throws(()=>importedFileName('a.xml.exe'));assert.throws(()=>importedFileName('a.svg'))
})
