import assert from 'node:assert/strict'
import {test} from 'node:test'
import {normalizeBackendInput,rustBackendFingerprint} from './lib/rust-backend-baseline.mjs'
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
test('the published baseline and current documentation-only successor have the same actual backend inputs',()=>{
 const baseline=rustBackendFingerprint('v1.3.9'),current=rustBackendFingerprint('HEAD')
 assert.ok(baseline.files>20);assert.deepEqual(current,baseline)
})
