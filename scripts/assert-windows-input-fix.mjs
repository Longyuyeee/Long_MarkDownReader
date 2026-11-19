import assert from 'node:assert/strict'
import fs from 'node:fs'
import {execFileSync} from 'node:child_process'

// Reuse the native old/new control only while its exact fixture and resolved
// Tao version are unchanged. Installation and upgrade still run on this build.
const proof=JSON.parse(fs.readFileSync('docs/evidence/windows-input-2026-11-19/keyboard-reentrancy-results.json','utf8'))
const lock=fs.readFileSync('src-tauri/Cargo.lock','utf8')
const resolved=lock.match(/^name = "tao"\r?\nversion = "([^"]+)"/m)?.[1]
assert.equal(proof.status,'passed')
assert.match(proof.sourceCommit,/^[a-f0-9]{40}$/)
assert.equal(proof.fixedTao,resolved)
assert.deepEqual(proof.results.map(r=>[r.version,r.exitCode]),[['0.34.5',42],[resolved,0]])
assert.equal(proof.results[0].output,'keyboard-focus-deadlock')
assert.match(proof.results[1].output,/^responsive key_cycles=\d+ focus_messages=\d+$/)
for(const file of ['scripts/check-windows-keyboard-reentrancy.ps1','scripts/fixtures/windows-keyboard-reentrancy.rs']){
 const original=execFileSync('git',['show',proof.sourceCommit+':'+file],{encoding:'utf8'}).replace(/\r\n/g,'\n')
 assert.equal(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'),original,'Changed fixture requires a new native control: '+file)
}
console.log('Native input deadlock control matches the unchanged fixture and resolved Tao '+resolved+'. Current installer lifecycle remains required.')
