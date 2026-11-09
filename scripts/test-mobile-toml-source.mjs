import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkTomlSource, tomlPosition } from '../src/mobile/tomlSource.ts'
import { TOML_SOURCE_BUDGET } from '../src/mobile/tomlBudget.ts'
import { importedFileName, importedCopyName, decodeImportedText } from '../src/mobile/textImport.ts'
import { textExportName, captureTextExport } from '../src/mobile/textExport.ts'
const source=readFileSync('tests/android-storage-provider/src/main/assets/toml-source/toml-source.toml','utf8')
test('TOML 源码检查保留 BOM、CRLF / LF、注释、长整数、日期、原义 / 多行字符串及表数组',()=>{
 const before=Buffer.from(source),r=checkTomlSource(source);assert.equal(r.valid,true,r.message);assert.equal(r.complete,true);assert.equal(r.assignments,15);assert.equal(r.tables,3);assert.equal(r.arrayTables,2);assert.deepEqual(Buffer.from(source),before)
})
test('TOML 检查重复键、点号与引号键冲突、重复表和封闭的内联表扩展',()=>{
 for(const s of ['a=1\na=2','a.b=1\n[a]\nc=2','"a"=1\na=2','[a]\nx=1\n[a]\ny=2','a={x=1,x=2}','a={x=1}\na.y=2','a=1\n[a]','a..b=1']){const r=checkTomlSource(s);assert.equal(r.valid,false,s);assert.equal(r.complete,true,s);assert.ok(r.offset>=0&&r.offset<=s.length)}
 for(const s of ['a.b=1\na.c=2','"a.b"=1\na.b=2','[[a]]\nx=1\n[[a]]\nx=2'])assert.equal(checkTomlSource(s).valid,true,s)
})
test('TOML 错误数组、标点、缺值、非法数值、日期和转义不会被修复为通过',()=>{
 for(const s of ['a=','a=[1,','a=01','a=1__0','a=0x_1','a=TRUE','a=null','a=1 b=2','a="\\q"','a="\\uD800"','a="\\U00110000"','a=2023-02-29','a=2024-13-01','a=25:00:00','a=1\rb=2','# bad\u0001\na=1']){const r=checkTomlSource(s);assert.equal(r.valid,false,s);assert.equal(r.complete,true,s)}
})
test('TOML 有符号 64 位边界用 BigInt 检查，精确数字保留且超范围不发布通过结果',()=>{
 for(const v of ['9223372036854775807','-9223372036854775808','9_007_199_254_740_993','0x7fff_ffff_ffff_ffff','0o755','0b1101','-0','+0','1.2300e+99','inf','-inf','+nan','-0.0'])assert.equal(checkTomlSource('v='+v).valid,true,v)
 for(const v of ['9223372036854775808','-9223372036854775809','0xffffffffffffffff','1e999']){const r=checkTomlSource('v='+v);assert.equal(r.valid,false,v);assert.equal(r.complete,false,v);assert.match(r.message,/范围/)}
})
test('TOML 新版语法按显式 1.0 检查，空文件与合法多行数组可通过',()=>{
 for(const s of ['', '# empty\r\n','a=[1,\n2,]\n',"a='literal # [] {}'",'a="""\nfirst\\\n  second\n"""'])assert.equal(checkTomlSource(s).valid,true,s)
 for(const s of ['a={x=1,\ny=2,}','a="\\x41"','a=12:34']){const r=checkTomlSource(s);assert.equal(r.valid,false);assert.match(r.message,/TOML 1.0.*1.1/)}
})
test('TOML 错误定位使用原始 UTF16 偏移及 Unicode 列，补齐结束括号后通过',()=>{
 const invalid=readFileSync('tests/android-storage-provider/src/main/assets/toml-source/toml-invalid.toml','utf8'),r=checkTomlSource(invalid);assert.equal(r.valid,false);assert.equal(r.offset,invalid.length);assert.equal(checkTomlSource(invalid+']').valid,true);const s='\ufefftitle="😎"\r\na = [1,';const error=checkTomlSource(s);assert.equal(error.offset,s.length);assert.equal(error.line,2);assert.equal(error.column,8);assert.deepEqual(tomlPosition('\ufeffa="😎" ',8),{line:1,column:7});assert.equal(checkTomlSource('a="\ud800"').valid,false)
})
test('TOML 超长、过深、过多词法节点或点号路径明确退出检查',()=>{
 for(const s of ['a="'+'x'.repeat(TOML_SOURCE_BUDGET.characters)+'"','a='+'['.repeat(65)+'1'+']'.repeat(65),Array.from({length:11000},(_,i)=>`a${i}=1`).join('\n'),Array.from({length:65},()=> 'a').join('.')+'=1']){const r=checkTomlSource(s);assert.equal(r.valid,false);assert.equal(r.complete,false);assert.match(r.message,/预算/)}
})
test('TOML 文件导入、未完成源码与导出保持扩展名、字节和 MIME 默认名称',()=>{
 const id='01234567-89ab-cdef-0123-456789abcdef',unfinished=source+'new = [';assert.equal(importedFileName('配置.TOML'),'配置.toml');for(const mime of ['application/toml','application/x-toml','text/toml','text/x-toml'])assert.equal(importedFileName('',mime),'导入配置.toml');assert.equal(importedCopyName('配置.TOML',id),'配置-导入-'+id+'.toml');assert.equal(textExportName('目录/配置.TOML'),'配置-导出副本.toml');assert.equal(decodeImportedText(Buffer.from(unfinished)),unfinished);assert.equal(captureTextExport({rootId:'local',relativePath:'配置.toml',content:unfinished,expectedSignature:null,revision:1,dirty:true}).content,unfinished);assert.throws(()=>importedFileName('a.toml.exe'))
})
