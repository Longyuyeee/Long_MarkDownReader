import assert from 'node:assert/strict'
import {test} from 'node:test'
import fs from 'node:fs'
import {resolve,dirname,basename} from 'node:path'
import {execFileSync} from 'node:child_process'
import {assertFrozenBuildSource} from './assert-frozen-build-source.mjs'

test('frozen product permits an unchanged ancestor builder and rejects changed build definitions',()=>{
 const parent=resolve('.release-secrets');fs.mkdirSync(parent,{recursive:true})
 const root=fs.mkdtempSync(resolve(parent,'v120-build-source-'))
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
 const write=(file,text)=>{fs.mkdirSync(dirname(resolve(root,file)),{recursive:true});fs.writeFileSync(resolve(root,file),text)}
 const commit=()=>{git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-m','owned fixture');return git('rev-parse','HEAD')}
 try {
  git('init');write('.github/workflows/v1-1-0-candidate-lifecycle.yml','checkout: frozen-product\n');write('src-tauri/tauri.u2.conf.json','{}\n');const builder=commit()
  write('screen.css','fixed toolbar width\n');const product=commit()
  assert.equal(assertFrozenBuildSource(builder,product,root).productCommit,product)
  assert.equal(assertFrozenBuildSource(product,builder,root).productCommit,builder)
  const orphan=git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit-tree',git('rev-parse',builder+'^{tree}'),'-m','independent fixture')
  assert.throws(()=>assertFrozenBuildSource(orphan,product,root),/same development history/)
  write('src-tauri/tauri.u2.conf.json','{"changed":true}\n');const changedConfig=commit()
  assert.throws(()=>assertFrozenBuildSource(builder,changedConfig,root),/builder definition differs/)
  write('src-tauri/tauri.u2.conf.json','{}\n');write('.github/workflows/v1-1-0-candidate-lifecycle.yml','checkout: mutable-product\n');const changedWorkflow=commit()
  assert.throws(()=>assertFrozenBuildSource(builder,changedWorkflow,root),/builder definition differs/)
  assert.throws(()=>assertFrozenBuildSource('main',product,root),/Exact Git commit/)
 } finally {
  assert.equal(dirname(root),parent);assert.ok(basename(root).startsWith('v120-build-source-'))
  fs.rmSync(root,{recursive:true,force:true})
 }
})
