import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {test} from 'node:test'
import ts from 'typescript'
const text=fs.readFileSync('src/views/TextEditorView.vue','utf8'),library=fs.readFileSync('src/views/LibraryMode.vue','utf8'),js=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
const libraryDeclaration=name=>{
 const source=ts.createSourceFile('LibraryMode.ts',library.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)[1],ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
 const declaration=source.statements.filter(ts.isVariableStatement).flatMap(statement=>[...statement.declarationList.declarations]).find(item=>item.name.getText(source)===name)
 assert.ok(declaration,`${name} must remain a real component declaration`)
 return 'const '+declaration.getText(source)
}
test('a text read completing after unmount cannot re-register a global shortcut',async()=>{
 let mounted,unmounted,resolve;const listeners=new Set(),pending=new Promise(done=>{resolve=done}),handler=()=>{},context=vm.createContext({onMounted:fn=>{mounted=fn},onBeforeUnmount:fn=>{unmounted=fn},createEditor:()=>{},nextTick:()=>Promise.resolve(),load:()=>pending,window:{addEventListener:(_type,fn)=>listeners.add(fn),removeEventListener:(_type,fn)=>listeners.delete(fn)},handleKeydown:handler,loadGeneration:1,viewTimer:0,clearTimeout:()=>{},rememberTextPosition:()=>{},editor:{destroy:()=>{}}})
 vm.runInContext(js(text.slice(text.lastIndexOf('onMounted(async () => {'),text.indexOf('</script>'))),context);const task=mounted();await Promise.resolve();await Promise.resolve();unmounted();resolve();await task;assert.equal(listeners.size,0);assert.equal(context.editor,null);assert.equal(context.loadGeneration,2)
})
function key(){const result={consumed:0,opened:0},event={ctrlKey:true,key:'h',preventDefault:()=>result.consumed++,stopImmediatePropagation:()=>result.consumed++};return {result,event}}
test('a detached text editor leaves the active document shortcut untouched',()=>{
 const{result,event}=key(),context=vm.createContext({editor:{dom:{isConnected:false}},viewMode:{value:'source'},document:{querySelector:()=>null},openFind:()=>result.opened++,save:()=>{}});vm.runInContext(js(text.slice(text.indexOf('const handleKeydown ='),text.indexOf('const formatBytes')))+'\nglobalThis.run=handleKeydown',context);context.run(event);assert.deepEqual(result,{consumed:0,opened:0});context.editor.dom.isConnected=true;context.run(event);assert.deepEqual(result,{consumed:2,opened:1})
})
test('a detached Markdown editor cannot consume another view shortcut',()=>{
 const{result,event}=key(),element={isConnected:false},context=vm.createContext({isVditorReady:true,vditor:{getCurrentMode:()=>'wysiwyg',vditor:{wysiwyg:{element}}},activeIsMarkdown:{value:true},activeEmbeddedEditor:{value:null},document:{querySelector:()=>null},openDocumentFind:()=>result.opened++});vm.runInContext(js(libraryDeclaration('handleFindShortcut'))+'\nglobalThis.run=handleFindShortcut',context);context.run(event);assert.deepEqual(result,{consumed:0,opened:0});element.isConnected=true;context.run(event);assert.deepEqual(result,{consumed:2,opened:1})
})
