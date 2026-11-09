import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { inspectTomlStructure, prepareTomlValuePatch } from '../src/mobile/tomlStructure.ts'
const source='\uFEFF# keep😎\r\nv=\'old\' # target\n[other]\r\nv=9007199254740993123\nwhen=2026-10-24T09:08:07.123456789+08:00\r\n'
const inputs=[['string','false'],['string','a=1 # [x]'],['string','中文😎\n换行'],['string','\u007f\u0000'],['string','"\\'],['integer','9223372036854775807'],['integer','-9223372036854775808'],['integer','-0'],['float','1.2300e+99'],['boolean','false']]
const cases=inputs.map(([kind,input])=>{const field=inspectTomlStructure(source).fields.find(f=>f.label==='v'),p=prepareTomlValuePatch(source,field.id,kind,input);const candidate=source.slice(0,p.from)+p.text+source.slice(p.to);assert.equal(candidate.slice(0,p.from),source.slice(0,p.from));assert.equal(candidate.slice(p.from+p.text.length),source.slice(p.to));return{kind,input,source,candidate}})
const python=spawnSync(process.env.LONGEDIT_PYTHON||'python',['-c',`import sys,json,tomllib
cases=json.load(sys.stdin.buffer)
for c in cases:
 before=tomllib.loads(c['source'].removeprefix(chr(0xfeff))); after=tomllib.loads(c['candidate'].removeprefix(chr(0xfeff)))
 assert before['other']==after['other'] and set(before)==set(after)
 kind=c['kind']; value=after['v']; text=c['input']
 if kind=='string': assert type(value)==str and value==text
 elif kind=='integer': assert type(value)==int and value==int(text)
 elif kind=='float': assert type(value)==float and value==float(text)
 elif kind=='boolean': assert type(value)==bool and value==(text=='true')
print(json.dumps({'python':sys.version.split()[0],'count':len(cases),'passed':True}))`],{input:JSON.stringify(cases),encoding:'utf8'})
assert.equal(python.status,0,python.stderr);const oracle=JSON.parse(python.stdout),output=process.argv[2]||'docs/evidence/mobile-0.1.0/toml-structure-native-2026-10-24';await mkdir(output,{recursive:true});await writeFile(output+'/oracle.json',JSON.stringify({kind:'independent-toml-value-patch-crosscheck',...oracle,cases:cases.map(c=>({kind:c.kind,input:c.input})),scope:'Python tomllib independently checks ten generated values and unchanged other-table semantics; source prefix/suffix bytes are asserted separately. Not a complete TOML conformance test.'},null,2)+'\n');console.log(`${oracle.count} independent TOML value checks passed`)
