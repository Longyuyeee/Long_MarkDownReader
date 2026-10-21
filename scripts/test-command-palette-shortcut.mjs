import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {test} from 'node:test'
const source=fs.readFileSync('src/App.vue','utf8')
function handler(){
 let opened=0
 const context=vm.createContext({openCommandPalette:()=>opened++})
 const body=source.slice(source.indexOf('const handlePaletteKeydown ='),source.indexOf('const handleGlobalKeydown ='))
 vm.runInContext(ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nglobalThis.run=handlePaletteKeydown',context)
 return {run:context.run,opened:()=>opened}
}
test('Ctrl or Cmd P is consumed before embedded editors can switch preview',()=>{
 for(const modifiers of [{ctrlKey:true},{metaKey:true},{ctrlKey:true,key:'P'}]){
  const h=handler();let prevented=0,stopped=0
  h.run({key:'p',ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,...modifiers,preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++})
  assert.equal(h.opened(),1);assert.equal(prevented,1);assert.equal(stopped,1)
 }
})
test('other editor and scoped fullscreen shortcuts keep their existing handlers',()=>{
 for(const modifiers of [{key:'F11'},{ctrlKey:true,key:'s'},{ctrlKey:true,shiftKey:true},{ctrlKey:true,altKey:true},{}]){
  const h=handler();h.run({key:'p',ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,...modifiers,preventDefault:()=>assert.fail('unrelated key consumed'),stopImmediatePropagation:()=>assert.fail('unrelated key stopped')});assert.equal(h.opened(),0)
 }
})
test('only the palette shortcut captures keydown and its listener is removed on disposal',()=>{
 for(const line of ["window.addEventListener('keydown', handlePaletteKeydown, true)","window.removeEventListener('keydown', handlePaletteKeydown, true)","window.addEventListener('keydown', handleGlobalKeydown)","window.removeEventListener('keydown', handleGlobalKeydown)"])assert.ok(source.includes(line),line)
 assert.ok(!source.includes("addEventListener('keydown', handleGlobalKeydown, true)"))
})
