import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import test from 'node:test'
const source=fs.readFileSync('src/services/appTooltipPolicy.ts','utf8'),end=source.indexOf('const adoptTitlesInside')
const context={};vm.runInNewContext(ts.transpileModule(source.slice(0,end)+'\nglobalThis.adopt=adoptNativeTitle',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context)
const element=(documentContent=false)=>{const attributes=new Map([['title','原始标题']]);return {attributes,closest:()=>documentContent?{}:null,matches:selector=>selector.startsWith('button'),getAttribute:key=>attributes.get(key),hasAttribute:key=>attributes.has(key),removeAttribute:key=>attributes.delete(key),setAttribute:(key,value)=>attributes.set(key,value)}}
test('link and image titles in document content remain serializable without UI decoration',()=>{
 const link=element(true);context.adopt(link);assert.deepEqual([...link.attributes],[['title','原始标题']])
})
test('normal application controls retain themed tooltips and accessible labels',()=>{
 const button=element();context.adopt(button);assert.equal(button.attributes.has('title'),false);assert.equal(button.attributes.get('data-app-tooltip'),'原始标题');assert.equal(button.attributes.get('aria-label'),'原始标题')
})
