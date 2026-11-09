// Independent local TOML 1.0 cross-check. Python 3.11+ is needed only for this optional verification.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { checkTomlSource } from '../src/mobile/tomlSource.ts'
const fixture=await readFile('tests/android-storage-provider/src/main/assets/toml-source/toml-source.toml','utf8')
const samples=[fixture,fixture.slice(0,-3), '', 'a=9007199254740993123', 'a=2024-02-29', 'a=2023-02-29', 'a=2026-10-24T09:08:07.123456789+08:00', '"a.b"=1\na.b=2', 'a.b=1\n[a]\nx=2', 'a={x=1,x=2}', '[[a]]\nx=1\n[[a]]\nx=2', 'a=[1,\n2,]', 'a="\\uD800"', 'a=1\rb=2','a={x=1,\ny=2,}', 'a="\\x41"']
const python=spawnSync(process.env.LONGEDIT_PYTHON||'python',['-c',`import sys,json,tomllib
sources=json.load(sys.stdin.buffer)
checks=[]
for s in sources:
 try: tomllib.loads(s.removeprefix(chr(0xfeff))); checks.append(True)
 except tomllib.TOMLDecodeError: checks.append(False)
print(json.dumps({'python':sys.version.split()[0],'checks':checks}))`],{input:JSON.stringify(samples),encoding:'utf8'})
assert.equal(python.status,0,python.stderr);const oracle=JSON.parse(python.stdout)
const checks=samples.map((source,i)=>{const app=checkTomlSource(source);assert.equal(app.complete,true,'Common TOML 1.0 sample');assert.equal(app.valid,oracle.checks[i],`Sample ${i}`);return{sample:i,appValid:app.valid,pythonValid:oracle.checks[i]}})
const output=process.argv[2]||'docs/evidence/mobile-0.1.0/toml-source-native-2026-10-24';await mkdir(output,{recursive:true});await writeFile(output+'/oracle.json',JSON.stringify({kind:'independent-toml-1.0-crosscheck',passed:true,python:oracle.python,checks,scope:'16 shared valid/invalid examples using Python tomllib, not a complete TOML conformance suite. Both checkers deliberately remove one initial BOM.'},null,2)+'\n');console.log(`${checks.length} independent TOML checks passed`)
