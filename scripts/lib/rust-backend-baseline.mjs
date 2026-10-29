import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import {releaseValidationProfile} from './release-validation-profile.mjs'

const git = (...args) => execFileSync('git', args, {maxBuffer:32*1024*1024})
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const objects = (ref, files) => {
  if (!files.length) return new Map()
  const result=execFileSync('git',['cat-file','--batch'],{input:files.map(file=>ref+':'+file+'\n').join(''),maxBuffer:32*1024*1024})
  let offset=0
  return new Map(files.map(file=>{
    const end=result.indexOf(10,offset),header=result.subarray(offset,end).toString('utf8').match(/^[a-f0-9]{40} blob (\d+)$/)
    assert.ok(header,'Tracked backend input is unavailable: '+file)
    const start=end+1,size=Number(header[1]);offset=start+size+1
    return [file,result.subarray(start,start+size)]
  }))
}
export function normalizeBackendInput(file, bytes) {
  let text = bytes.toString('utf8').replace(/\r\n/g,'\n')
  if (file === 'src-tauri/Cargo.toml') return text.replace(/(\[package\][\s\S]*?\nversion = ")[^"]+("\n)/, '$1<version>$2')
  if (file === 'src-tauri/Cargo.lock') return text.replace(/(\[\[package\]\]\nname = "tauri-app"\nversion = ")[^"]+("\n)/, '$1<version>$2')
  if (file === 'src-tauri/tauri.conf.json' || file.startsWith('shared/')) {
    const value = JSON.parse(text)
    if (file === 'src-tauri/tauri.conf.json') delete value.version
    else delete value.appVersion
    return JSON.stringify(value)
  }
  return text
}
export function rustBackendFingerprint(ref) {
  assert.match(ref,/^(?:[a-f0-9]{40}|HEAD|v\d+\.\d+\.\d+)$/)
  const files=git('ls-tree','-r','--name-only',ref,'src-tauri').toString('utf8').trim().split('\n')
    .filter(file=>/\.rs$/.test(file)||/\/Cargo\.(?:toml|lock)$/.test(file)||file.endsWith('.json'))
  const contents=objects(ref,files),includedFiles=new Set()
  for(const [file,bytes] of [...contents]) if(file.endsWith('.rs')) {
    for(const match of bytes.toString('utf8').matchAll(/include_(?:str|bytes)!\(\s*"([^"]+)"/g)) {
      const included=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1]))
      if(included.startsWith('shared/')) includedFiles.add(included)
    }
  }
  for(const [file,bytes]of objects(ref,[...includedFiles]))contents.set(file,bytes)
  const entries=[...contents].sort(([a],[b])=>a.localeCompare(b)).map(([file,bytes])=>[file,sha(normalizeBackendInput(file,bytes))])
  return {sha256:sha(JSON.stringify(entries)),files:entries.length}
}
export function prepareRustBaseline(version, candidate='HEAD') {
  const profile=releaseValidationProfile(version), sourceCommit=git('rev-parse',candidate).toString('utf8').trim()
  if(!profile) return {schemaVersion:1,version,sourceCommit,reused:false,reason:'full-regression-required'}
  const baseline=profile.baseline
  assert.equal(git('rev-parse',baseline.tag+'^{commit}').toString('utf8').trim(),baseline.sourceCommit)
  const baselineBytes=fs.readFileSync(baseline.manifestPath)
  assert.equal(sha(baselineBytes),baseline.manifestSha256)
  const current=rustBackendFingerprint(sourceCommit), prior=rustBackendFingerprint(baseline.sourceCommit)
  return {schemaVersion:1,version,sourceCommit,reused:current.sha256===prior.sha256,
    reason:current.sha256===prior.sha256?'backend-code-dependencies-and-compiled-contracts-unchanged':'backend-inputs-changed',
    currentFingerprint:current,baselineFingerprint:prior,baseline:structuredClone(baseline),
    historicalFunctionalResultsCountedAsCurrent:false,currentInstallerBuildRequired:true}
}
export function assertRustBaselineProof(proof) {
  const actual=prepareRustBaseline(proof.version,proof.sourceCommit)
  assert.equal(actual.reused,true,'Changed backend inputs require the full Rust suite')
  assert.deepEqual(proof,actual,'Rust baseline proof must be reproduced from the actual frozen sources')
}
