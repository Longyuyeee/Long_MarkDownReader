import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {fixturePaths} from './v118-native-search-fixture.mjs'
export const officeFixtureSpecs=[
  {name:'原文定位.docx',source:'fixtures/docx/producers/libreoffice-writer.docx',sha256:'a549705f8650065a1fbb7111b598b5ae509f0b387ec58db47547f7445e26dea3'},
  {name:'演示定位.pptx',source:'fixtures/pptx/producers/libreoffice-impress.pptx',sha256:'4ef5578bd9657eb7b1a04fa8c7ffb5eb7c2fc4046f49608ed7a0fff75d8c2140'},
  {name:'工作表定位.xlsx',source:'src-tauri/tests/fixtures/workbook/compatibility-baseline.xlsx',sha256:'52410b394655fbcc20850c17397d671d5947540cc5bca1f1dfb1f69434f5486c'},
]
export const officeHash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
export const officePathKey=value=>value.replaceAll('\\','/').replace(/^\/\/\?\//,'').toLowerCase()
export async function createNativeOfficeFixture(root,repo){
  const fixture=fixturePaths(root)
  const owner=JSON.parse(await fs.readFile(path.join(root,'.v118-native-owner'),'utf8'))
  assert.equal(owner.kind,'generated-search-fixture');assert.match(owner.nonce,/^[a-f0-9-]{36}$/)
  const originals=await Promise.all(officeFixtureSpecs.map(async spec=>{
    const bytes=await fs.readFile(path.join(repo,spec.source));assert.equal(officeHash(bytes),spec.sha256,'immutable Office fixture '+spec.source)
    return {spec,bytes}
  }))
  // Added only after cold/restart/Markdown/PDF checks, so canonical 244/487
  // baselines remain unchanged. Exclusive creation never replaces any file.
  const directory=path.join(fixture.library,'定位资料');await fs.mkdir(directory,{recursive:false})
  const files=[]
  for(const {spec,bytes} of originals){const target=path.join(directory,spec.name);await fs.writeFile(target,bytes,{flag:'wx'});files.push({...spec,path:target})}
  return files
}
