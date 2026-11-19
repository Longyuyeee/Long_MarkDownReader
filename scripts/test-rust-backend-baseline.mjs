import assert from 'node:assert/strict'
import {test} from 'node:test'
import fs from 'node:fs'
import {normalizeBackendInput,rustBackendFingerprint,prepareRustBaseline} from './lib/rust-backend-baseline.mjs'
const normalized=(file,text)=>normalizeBackendInput(file,Buffer.from(text))
test('only the application version and compiled-contract version labels are normalized',()=>{
 const cargo='[package]\nname = "tauri-app"\nversion = "1.3.9"\n[dependencies]\nfoo = "1"\n'
 assert.equal(normalized('src-tauri/Cargo.toml',cargo),normalized('src-tauri/Cargo.toml',cargo.replace('1.3.9','1.3.10')))
 assert.notEqual(normalized('src-tauri/Cargo.toml',cargo),normalized('src-tauri/Cargo.toml',cargo.replace('foo = "1"','foo = "2"')))
 const config={version:'1.3.9',app:{windows:[{width:1000}]}}
 assert.equal(normalized('src-tauri/tauri.conf.json',JSON.stringify(config)),normalized('src-tauri/tauri.conf.json',JSON.stringify({...config,version:'1.3.10'})))
 assert.notEqual(normalized('src-tauri/tauri.conf.json',JSON.stringify(config)),normalized('src-tauri/tauri.conf.json',JSON.stringify({...config,app:{windows:[]}})))
 assert.equal(normalized('shared/file-formats.json','{"appVersion":"1.3.9","formats":["md"]}'),normalized('shared/file-formats.json','{"appVersion":"1.3.10","formats":["md"]}'))
 assert.notEqual(normalized('shared/file-formats.json','{"formats":["md"]}'),normalized('shared/file-formats.json','{"formats":[]}'))
})
test('the published documentation-only 1.3.15 retains its immutable backend baseline',()=>{
 const baseline=rustBackendFingerprint('v1.3.9'),published=rustBackendFingerprint('v1.3.15')
 assert.ok(baseline.files>20);assert.deepEqual(published,baseline)
})

test('current backend input changes require full regression instead of inheriting the published result',()=>{
 const version=JSON.parse(fs.readFileSync('package.json','utf8')).version
 const proof=prepareRustBaseline(version)
 const unchanged=proof.currentFingerprint.sha256===proof.baselineFingerprint.sha256
 assert.equal(proof.reused,unchanged)
 assert.equal(proof.reason,unchanged?'backend-code-dependencies-and-compiled-contracts-unchanged':'backend-inputs-changed')
 assert.equal(proof.historicalFunctionalResultsCountedAsCurrent,false)
 assert.equal(proof.currentInstallerBuildRequired,true)
 if(version==='1.3.16')assert.equal(proof.reused,false,'The Windows framework update must execute the full Rust suite')
})
