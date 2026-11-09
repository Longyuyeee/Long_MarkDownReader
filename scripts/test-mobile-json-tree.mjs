import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectJsonStructure} from '../src/mobile/jsonStructure.ts'
import {jsonTreeRows,initialJsonExpansion} from '../src/mobile/jsonTree.ts'
test('tree IDs retain source order, duplicate identity, literal big numbers and prototype names',()=>{
 const source='\uFEFF{"app":{"same":1,"same":9007199254740993,"__proto__":null},"arr":[false,0]}\r\n',f=inspectJsonStructure(source).fields,original=JSON.stringify(f)
 const rows=jsonTreeRows(f,f[0].children,initialJsonExpansion(f));assert.deepEqual(rows.filter(r=>!r.more).map(r=>f[r.id].label),['app','same','same','__proto__','arr','[0]','[1]']);assert.equal(source.slice(f[3].from,f[3].to),'9007199254740993');assert.equal(JSON.stringify(f),original);assert.equal({}.polluted,undefined)
})
test('collapsed branches are omitted while direct source rows remain reachable',()=>{const f=inspectJsonStructure('{"a":{"b":1},"c":2}').fields;assert.deepEqual(jsonTreeRows(f,f[0].children,new Set()).map(r=>r.id),[1,3])})
test('large branches have a real parent continuation, never a fabricated field',()=>{const f=inspectJsonStructure('{"a":['+Array(100).fill('0').join(',')+'],"tail":true}').fields;const r=jsonTreeRows(f,f[0].children,new Set([1]));assert.equal(r.filter(x=>x.id===1&&x.more).length,1);assert.equal(r.at(-1).id,f.at(-1).id);assert.ok(r.length<36)})
test('nested expansion is bounded and does not hide later root siblings',()=>{const f=inspectJsonStructure('{"nested":'+Array(12).fill('{"next":').join('')+'0'+'}'.repeat(12)+',"last":false}').fields;const r=jsonTreeRows(f,f[0].children,new Set(f.map(x=>x.id)));assert.ok(r.some(x=>x.more));assert.ok(r.every(x=>x.depth<=6));assert.equal(r.at(-1).id,f.at(-1).id)})
test('row budget applies across multiple expanded branches and keeps root IDs',()=>{const f=inspectJsonStructure('{'+Array.from({length:20},(_,n)=>'"k'+n+'":['+Array(35).fill('1').join(',')+']').join(',')+'}').fields;const r=jsonTreeRows(f,f[0].children,new Set(f.map(x=>x.id)),128);assert.ok(r.length<=128,r.length);for(const id of f[0].children)assert.ok(r.some(x=>x.id===id&&!x.more))})
test('initial expansion opens only a small object and small array',()=>{const f=inspectJsonStructure('{"app":{"font":17},"library":{"path":"local"},"recent":[1,2],"large":['+Array(50).fill('0').join(',')+']}').fields;assert.deepEqual([...initialJsonExpansion(f)].map(id=>f[id].label),['app','recent'])})
