import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkYamlSource, yamlPosition, YAML_SOURCE_BUDGET } from '../src/mobile/yamlSource.ts'
import { importedFileName, importedCopyName, decodeImportedText } from '../src/mobile/textImport.ts'
import { textExportName, captureTextExport } from '../src/mobile/textExport.ts'
const source=readFileSync('tests/android-storage-provider/src/main/assets/yaml-source/yaml-source.yaml','utf8')
test('YAML 多文档、注释、BOM、锚点、别名、块标量和精确数值可检查，源字节不变',()=>{
 const before=Buffer.from(source),r=checkYamlSource(source);assert.equal(r.valid,true);assert.equal(r.documents,2);assert.deepEqual(r.diagnostics,[]);assert.deepEqual(Buffer.from(source),before)
})
test('YAML 不展开循环和指数别名，锚点仅在当前文档和出现顺序内可用',()=>{
 for(const text of ['a: &a [*a]','a: &a [x,x]\nb: &b [*a,*a]\nc: [*b,*b]'])assert.equal(checkYamlSource(text).valid,true)
 for(const text of ['a: *missing','a: *later\nb: &later 1','a: &a 1\n---\nb: *a'])assert.ok(checkYamlSource(text).diagnostics.some(d=>d.code==='UNRESOLVED_ALIAS'))
})
test('YAML 重复键、流集合缺失、缩进错误会报告可定位的问题',()=>{
 for(const text of ['a: 1\na: 2','a: [true','a:\n\tbad: 1']){const r=checkYamlSource(text);assert.equal(r.valid,false);assert.equal(r.complete,true);assert.ok(r.diagnostics.some(d=>d.severity==='error'&&d.offset>=0&&d.offset<=text.length))}
})
test('YAML 自定义标签是提示，不宣称检查通过或应用配置有效',()=>{
 const r=checkYamlSource('value: !application 42');assert.equal(r.valid,true);assert.ok(r.diagnostics.some(d=>d.severity==='warning'));assert.match(r.message,/有提示/)
})
test('YAML 空流、空文档、1.1 指令及复杂键可阅读检查',()=>{
 for(const text of ['', '# 注释\r\n','---\n','%YAML 1.1\n---\non: yes\n','? [one, two]\n: value\n'])assert.equal(checkYamlSource(text).valid,true,text)
})
test('YAML 超字符、节点、深度和文档预算均回退原文',()=>{
 for(const text of ['x'.repeat(YAML_SOURCE_BUDGET.characters+1),'a: '+'['.repeat(66)+'0'+']'.repeat(66),Array.from({length:129},()=> '---\na: 1\n').join(''),'['+Array(40001).fill('0').join(',')+']']){const r=checkYamlSource(text);assert.equal(r.complete,false);assert.equal(r.valid,false);assert.match(r.message,/预算/)}
})
test('YAML 诊断输出有界，跨 CRLF 和 emoji 的列位置准确',()=>{
 const r=checkYamlSource(Array.from({length:24},(_,i)=>`a${i}: !custom x`).join('\n'));assert.equal(r.diagnostics.length,20);assert.equal(r.truncated,true);assert.deepEqual(yamlPosition('\uFEFF#😎\r\n名字😎: [',12),{line:2,column:6})
})
test('YAML 文件全流程保持 yaml / yml 扩展名与未完成源文',()=>{
 const id='01234567-89ab-cdef-0123-456789abcdef',unfinished=source+'broken: [true'
 for(const ext of ['yaml','yml']){assert.equal(importedFileName('配置.'+ext.toUpperCase()),'配置.'+ext);assert.equal(importedCopyName('配置.'+ext,id),'配置-导入-'+id+'.'+ext);assert.equal(textExportName('目录/配置.'+ext),'配置-导出副本.'+ext);assert.equal(captureTextExport({rootId:'local',relativePath:'配置.'+ext,content:unfinished,expectedSignature:null,revision:1,dirty:true}).content,unfinished)}
 for(const mime of ['application/yaml','application/x-yaml','text/yaml','text/x-yaml'])assert.equal(importedFileName('',mime),'导入配置.yaml')
 assert.equal(decodeImportedText(Buffer.from(unfinished)),unfinished);assert.throws(()=>importedFileName('config.yaml.exe'))
})

test('结果到达上限后仍能定位后出现的真实错误，提示不把错误挤出结果',()=>{
 const warnings=Array.from({length:24},(_,i)=>'w'+i+': !app value').join('\n')
 const source=warnings+'\n---\na: 1\na: 2\n',result=checkYamlSource(source)
 assert.equal(result.complete,true);assert.equal(result.valid,false);assert.equal(result.truncated,true);assert.equal(result.diagnostics.length,20)
 const issue=result.diagnostics.find(d=>d.code==='DUPLICATE_KEY')
 assert.ok(issue);assert.equal(issue.offset,source.lastIndexOf('a: 2'))
 const aliasSource=warnings+'\nref: *missing\n',aliasResult=checkYamlSource(aliasSource)
 assert.equal(aliasResult.valid,false);assert.equal(aliasResult.truncated,true);assert.equal(aliasResult.diagnostics.find(d=>d.code==='UNRESOLVED_ALIAS')?.offset,aliasSource.indexOf('*missing'))
 const warningOnly=checkYamlSource(warnings);assert.equal(warningOnly.valid,true);assert.equal(warningOnly.truncated,true);assert.ok(warningOnly.diagnostics.every(d=>d.severity==='warning'))
 const errors=checkYamlSource('a: 0\n'+Array.from({length:24},(_,i)=>'a: '+(i+1)).join('\n'))
 assert.equal(errors.diagnostics.length,20);assert.equal(errors.truncated,true);assert.ok(errors.diagnostics.every(d=>d.severity==='error'))
})
