import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import { history, undo, redo, isolateHistory } from '@codemirror/commands'
import { checkJsonSource, JSON_SOURCE_BUDGET } from '../src/mobile/jsonSource.ts'
import { sourceFormat, sourceSlice, adoptSourceFormat } from '../src/mobile/sourceFormat.ts'
import { sourceRangeChange } from '../src/mobile/editorOffsets.ts'
import { importedFileName, importedCopyName, decodeImportedText } from '../src/mobile/textImport.ts'
import { captureTextExport, textExportName } from '../src/mobile/textExport.ts'
const lexical = text => text.replace(/^\uFEFF/,'').match(/"(?:[^"\\]|\\[\s\S])*"|[^\s{}\[\],:]+|[{}\[\],:]/g)
const source = '\uFEFF{ "id":900719925474099312345, "same":1,\r\n"same":-0, "科学":1.2300e+99,\n"字":"读书😎 \\u4e2d \\"", "arr":[true,false,null,{},[]] }\r\n'
test('JSON 整理只改变空白，重复键、超大数值、负零、转义与顺序逐词保持',()=>{
 const result=checkJsonSource(source,true);assert.equal(result.valid,true);assert.ok(result.formatted);assert.deepEqual(lexical(result.formatted),lexical(source));assert.ok(result.formatted.startsWith('\uFEFF{\r\n'));assert.ok(result.formatted.endsWith('}\r\n'));assert.equal(checkJsonSource(result.formatted,true).formatted,result.formatted)
 for(const text of ['1e99999','"x"','-0','[{},[],null]','{"__proto__":{"x":1}}']){assert.deepEqual(lexical(checkJsonSource(text,true).formatted),lexical(text))}
 assert.equal({}.x,undefined)
})
test('无效 JSON 给出源文位置；不把评论、尾逗号、空内容或多个根值当成有效 JSON',()=>{
 for(const text of ['{"x":}', '[1,]','{/*x*/"a":1}','', '{"a":01}', '{} {}','"a\nb"']){const result=checkJsonSource(text,true);assert.equal(result.valid,false);assert.equal(result.formatted,undefined);assert.ok(Number.isInteger(result.offset));assert.ok(result.line>0);assert.ok(result.column>0)}
 const result=checkJsonSource('\uFEFF{\r\n"a": 1,\r\n"b":\r\n}');assert.equal(result.valid,false);assert.ok(result.offset>=16);assert.ok(result.line>=3)
})
test('JSON 复杂度与排版输出预算不会截断或写回候选',()=>{
 assert.equal(checkJsonSource(' '.repeat(JSON_SOURCE_BUDGET.characters+1)).formatted,undefined)
 const nested='['.repeat(65)+'0'+']'.repeat(65);assert.match(checkJsonSource(nested,true).message,/嵌套/)
 const many='['+Array(25000).fill('1').join(',')+']';assert.equal(checkJsonSource(many,true).formatted,undefined)
 assert.equal(checkJsonSource('"'+'中'.repeat(60000)+'"',true).formatted,'"'+'中'.repeat(60000)+'"')
})
test('整份排版作为单次历史事务，撤销恢复 BOM 和混合换行，重做得到完整候选',()=>{
 const formatted=checkJsonSource(source,true).formatted;let state=EditorState.create({doc:source,extensions:[sourceFormat(source),history()]})
 state=state.update({...sourceRangeChange(state,source,0,source.length,formatted),effects:adoptSourceFormat(formatted),annotations:isolateHistory.of('full'),userEvent:'input.format'}).state
 assert.equal(sourceSlice(state),formatted)
 const target={get state(){return state},dispatch:transaction=>{state=transaction.state}}
 assert.equal(undo(target),true);assert.equal(sourceSlice(state),source);assert.equal(redo(target),true);assert.equal(sourceSlice(state),formatted)
})
test('JSON 导入、固定副本与导出保留扩展名及原文，不要求未完成的源文先通过语法',()=>{
 const id='01234567-89ab-cdef-0123-456789abcdef';assert.equal(importedFileName('设置.JSON'), '设置.json');assert.equal(importedFileName('','application/json'),'导入数据.json');assert.ok(importedCopyName('设置.json',id).endsWith(id+'.json'));assert.equal(textExportName('目录/设置.JSON'),'设置-导出副本.json')
 const content='\uFEFF{"unfinished":';assert.equal(decodeImportedText(new TextEncoder().encode(content)),content);assert.equal(captureTextExport({rootId:'local',relativePath:'设置.json',content,expectedSignature:null,revision:1,dirty:true}).content,content)
 assert.throws(()=>importedFileName('settings.exe'));assert.throws(()=>captureTextExport({relativePath:'a.pdf',content:''}))
})
