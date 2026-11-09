import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState, EditorSelection } from '@codemirror/state'
import { history, undo, redo } from '@codemirror/commands'
import { sourceFormat, sourceSlice } from '../src/mobile/sourceFormat.ts'
import { codeFormats, codeFileInfo, codeMimeFile, mobileTextPattern, textFileExtension } from '../src/mobile/codeFormats.ts'
import { codeTokenChange, codeLineOffset, codeLineCount, codeTokens } from '../src/mobile/codeCommands.ts'
import { importedFileName, importedCopyName, decodeImportedText } from '../src/mobile/textImport.ts'
import { textExportName, captureTextExport } from '../src/mobile/textExport.ts'
const id='456789ab-1234-4567-8901-123456789abc'
test('代码格式允许登记的源码扩展名，明确区分其他文件',()=>{
 for(const format of codeFormats)for(const extension of format.extensions){assert.equal(codeFileInfo(`目录/a.${extension.toUpperCase()}`).language,format.language);assert.equal(mobileTextPattern.test(`a.${extension}`),true);assert.equal(textFileExtension(`a.${extension}`),'.'+extension)}
 for(const file of ['a.exe','a.js.exe','a.js/other','a.py.txt','a.env','a.class'])assert.equal(codeFileInfo(file),undefined)
 for(const file of ['a.exe','a.js.exe','a.env','a.class'])assert.equal(mobileTextPattern.test(file),false)
})
test('源码 MIME 缺名称时按语言生成文本身份，不把不明内容变成代码',()=>{
 for(const[mime,ext]of [['text/javascript','js'],['application/javascript','js'],['application/x-javascript','js'],['text/typescript','ts'],['application/typescript','ts'],['text/x-python','py'],['application/x-python-code','py'],['text/html','html'],['text/css','css']]){assert.equal(codeMimeFile(mime.toUpperCase()+'; charset=UTF-8'),`导入源码.${ext}`);assert.equal(importedFileName('',mime),`导入源码.${ext}`)}assert.equal(codeMimeFile('video/mp2t'),'');assert.throws(()=>importedFileName('a.class','text/plain'));assert.throws(()=>importedFileName('a.exe','text/javascript'))
})
test('全部代码扩展名在导入、独立副本和导出中保持语言身份',()=>{
 for(const format of codeFormats)for(const ext of format.extensions){const name=importedFileName(`  a.${ext.toUpperCase()}  `);assert.equal(name,`a.${ext}`);assert.equal(importedCopyName(name,id),`a-导入-${id}.${ext}`);assert.equal(textExportName('目录/'+name),`a-导出副本.${ext}`);const snapshot=captureTextExport({rootId:'local',relativePath:name,content:'\uFEFFx\r\n',expectedSignature:'old',revision:1,dirty:true});assert.equal(snapshot.content,'\uFEFFx\r\n');assert.equal(Object.isFrozen(snapshot),true)}
})
test('源码导入保持 BOM、混合换行与标签，拒绝非法 UTF-8、零字节及超限',()=>{
 const source='\uFEFF// 😎\r\n<script>bad()</script>\n\tvalue\r';assert.equal(decodeImportedText(new TextEncoder().encode(source)),source);for(const bytes of [new Uint8Array([0xc3,0x28]),new Uint8Array([0]),new Uint8Array(4*1024*1024+1)])assert.throws(()=>decodeImportedText(bytes))
})
test('按行定位处理 BOM、CRLF、孤立 CR、空行及末尾新行',()=>{
 const s='\uFEFFone😎\r\n\rthree\n';assert.equal(codeLineCount(s),4);assert.equal(codeLineOffset(s,'1'),1);assert.equal(codeLineOffset(s,'2'),8);assert.equal(codeLineOffset(s,'3'),9);assert.equal(codeLineOffset(s,'4'),15);assert.equal(codeLineOffset('','1'),0);assert.equal(codeLineCount(''),1)
 for(const value of ['0','-1','1.5','1e2','01',' 1','2 ','1000000000','5'])assert.throws(()=>codeLineOffset(s,value))
})
test('成对符号包住正反向选择，不替换所选正文和原换行',()=>{
 const s='\uFEFFa\r\n选中😎\nb\r',from=1,to=8
 for(const token of codeTokens.filter(t=>t.value.length===2))for(const reverse of [false,true]){let state=EditorState.create({doc:s,selection:EditorSelection.single(reverse?to:from,reverse?from:to),extensions:[sourceFormat(s),history()]});const selected=sourceSlice(state,from,to);state=state.update(codeTokenChange(state,token.value)).state;assert.equal(sourceSlice(state),sourceSlice(EditorState.create({doc:s,extensions:[sourceFormat(s)]}),0,from)+token.value[0]+selected+token.value[1]+sourceSlice(EditorState.create({doc:s,extensions:[sourceFormat(s)]}),to));assert.equal(state.selection.main.anchor>state.selection.main.head,reverse)}
})
test('空选择把光标留在符号对中间，单字符替换所选内容',()=>{
 for(const token of codeTokens){let state=EditorState.create({doc:'hello',selection:{anchor:2},extensions:[history()]});state=state.update(codeTokenChange(state,token.value)).state;assert.equal(state.doc.toString(),'he'+token.value+'llo');assert.equal(state.selection.main.head,2+(token.value.length===2?1:token.value.length))}assert.throws(()=>codeTokenChange(EditorState.create(),'<script>'))
})
test('符号插入是一次独立历史事务，可完整撤销和重做',()=>{
 const s='\uFEFFone\r\ntwo\n';let state=EditorState.create({doc:s,selection:{anchor:2},extensions:[history(),sourceFormat(s)]});const dispatch=tr=>{state=tr.state};dispatch(state.update(codeTokenChange(state,'{}')));const changed=sourceSlice(state);assert.equal(undo({state,dispatch}),true);assert.equal(sourceSlice(state),s);assert.equal(redo({state,dispatch}),true);assert.equal(sourceSlice(state),changed)
})
test('首个不可见 BOM 前的光标或选区插入符号仍保留文件 BOM，且能完整撤销',()=>{
 const source='\uFEFFfirst😎\r\nsecond\n'
 for(const token of ['(',':','()','""'])for(const [anchor,head]of [[0,0],[0,1],[1,0],[0,6],[6,0]]){
  let state=EditorState.create({doc:source,selection:EditorSelection.single(anchor,head),extensions:[sourceFormat(source),history()]});const original=sourceSlice(state)
  const dispatch=transaction=>{state=transaction.state};dispatch(state.update(codeTokenChange(state,token)))
  assert.ok(sourceSlice(state).startsWith('\uFEFF'));assert.equal(sourceSlice(state).indexOf('\uFEFF'),0);assert.ok(sourceSlice(state).includes('\r\nsecond\n'));assert.equal(undo({state,dispatch}),true);assert.equal(sourceSlice(state),original)
 }
})
