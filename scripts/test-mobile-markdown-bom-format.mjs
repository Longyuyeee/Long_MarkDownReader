import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import path from 'node:path'
import {build} from 'esbuild'
import {EditorState,EditorSelection} from '@codemirror/state'
import {history,undo,redo} from '@codemirror/commands'
const out='docs/evidence/mobile-0.1.0/markdown-editor-v3-2026-11-05/bom-unit';await mkdir(out,{recursive:true})
await build({stdin:{contents:"export {formattingChange} from './src/mobile/editorCommands.ts'; export {sourceFormat,sourceSlice} from './src/mobile/sourceFormat.ts'",resolveDir:process.cwd()},bundle:true,packages:'external',platform:'node',format:'esm',outfile:out+'/format.mjs'})
const {formattingChange,sourceFormat,sourceSlice}=await import(pathToFileURL(path.resolve(out+'/format.mjs')).href)
let checks=0
function roundTrip(original,kind,expected,selection=EditorSelection.cursor(0)){
 let state=EditorState.create({doc:original,selection,extensions:[sourceFormat(original),history()]});state=state.update(formattingChange(state,kind)).state;assert.equal(sourceSlice(state),expected);const command={get state(){return state},dispatch:t=>state=t.state};assert.ok(undo(command));assert.equal(sourceSlice(state),original);assert.ok(redo(command));assert.equal(sourceSlice(state),expected);checks++
}
roundTrip('\uFEFF# 标题\r\n第二行\n尾行\r\n','heading','\uFEFF## 标题\r\n第二行\n尾行\r\n')
roundTrip('\uFEFF## 标题\r\n','heading','\uFEFF标题\r\n')
roundTrip('\uFEFF段落\r\n','list','\uFEFF- 段落\r\n')
roundTrip('\uFEFF段落\r\n','quote','\uFEFF> 段落\r\n')
roundTrip('\uFEFF','bold','\uFEFF**文字**')
roundTrip('\uFEFF标题\r\n','bold','\uFEFF**标题**\r\n',EditorSelection.range(0,3))
roundTrip('\uFEFF标题\r\n','bold','\uFEFF**标题**\r\n',EditorSelection.range(3,0))
roundTrip('\uFEFF标题\r\n第二行\n','list','\uFEFF- 标题\r\n- 第二行\n',EditorSelection.range(0,7))
roundTrip('# 普通标题\r\n','heading','## 普通标题\r\n')
console.log(`${checks} actual CodeMirror formatting/undo/redo BOM and mixed-newline checks passed`)
