import assert from 'node:assert/strict'
import {test} from 'node:test'
import {setVditorReadOnly} from '../src/utils/vditorReadOnly.ts'
test('all Markdown modes retain a focusable readonly reading surface and restore editable tab behavior',()=>{
 for(const mode of ['wysiwyg','ir','sv']){
  const attributes=new Map(),root={setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k)},editor={vditor:{[mode]:{element:root}},getCurrentMode:()=>mode,disabled:()=>attributes.set('contenteditable','false'),enable:()=>attributes.set('contenteditable','true')}
  assert.equal(setVditorReadOnly(editor,true),true);assert.equal(attributes.get('contenteditable'),'false');assert.equal(attributes.get('tabindex'),'0')
  assert.equal(setVditorReadOnly(editor,false),true);assert.equal(attributes.get('contenteditable'),'true');assert.equal(attributes.has('tabindex'),false)
 }
})
test('an editor destroyed during an asynchronous load cannot change the next reading surface',()=>{
 assert.equal(setVditorReadOnly(undefined,true),false);assert.equal(setVditorReadOnly({vditor:{},getCurrentMode:()=> 'ir'},true),false)
})
