import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {parse, compileScript} from '@vue/compiler-sfc'

const registry=fs.readFileSync('src/services/naiveComponents.ts','utf8').split('export const naiveComponents = {')[1].split('}')[0]
const globals=new Set(registry.match(/\bN[A-Z]\w+/g))
const missing=[]
let checked=0
for(const relative of fs.readdirSync('src',{recursive:true}).filter(p=>p.endsWith('.vue'))){
 const filename=path.join('src',relative),{descriptor}=parse(fs.readFileSync(filename,'utf8'))
 const bindings=descriptor.scriptSetup||descriptor.script?compileScript(descriptor,{id:filename}).bindings:{}
 for(const match of (descriptor.template?.content||'').matchAll(/<(n-[a-z][\w-]*|N[A-Z]\w*)\b/g)){
  const name=match[1].replace(/(^|-)([a-z])/g,(_,prefix,letter)=>letter.toUpperCase())
  checked++
  if(!globals.has(name)&&!Object.hasOwn(bindings,name))missing.push(`${filename}: ${match[1]}`)
 }
}
assert.deepEqual(missing,[],`Unregistered Naive UI components: ${missing.join(', ')}`)
console.log(`Checked ${checked} Naive UI component usages against production registration and local imports`)
