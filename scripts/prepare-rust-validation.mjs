import fs from 'node:fs'
import path from 'node:path'
import {prepareRustBaseline} from './lib/rust-backend-baseline.mjs'
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version
const output=process.argv[2]
if(!output)throw Error('Provide the build-owned backend proof output path')
const proof=prepareRustBaseline(version)
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(proof,null,2)+'\n')
if(process.env.GITHUB_ENV)fs.appendFileSync(process.env.GITHUB_ENV,'REUSE_RUST_BASELINE='+(proof.reused?'1':'0')+'\n')
console.log(proof.reused?'Unchanged Rust behavior: historical functional baseline referenced; current installer compilation remains required.':'Backend inputs changed: full Rust regression required.')
