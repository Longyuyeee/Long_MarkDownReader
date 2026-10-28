import assert from 'node:assert/strict'
import {test} from 'node:test'
import {claimStructuredPosition,structuredPositionDigest} from '../src/services/structuredPositionState.ts'
const point=async text=>({digest:Promise.resolve(await structuredPositionDigest(text)),ranges:[{anchor:4,head:1}],mainIndex:0,source:{top:510,left:0},panes:{outline:{top:240,left:0}}})
test('positions belong to each open tab, follow rename and reject a late previous owner',async()=>{
 const a={path:'one.json'},b={},old=claimStructuredPosition(a,'root/json');old.remember(await point('稿😀'))
 assert.equal(claimStructuredPosition(b,'root/json').position,undefined)
 a.path='renamed.json';const next=claimStructuredPosition(a,'root/json');assert.equal(next.position.source.top,510)
 old.remember(await point('late'));assert.equal(await claimStructuredPosition(a,'root/json').position.digest,await structuredPositionDigest('稿😀'))
})
test('scope changes and closing/reopening have no previous position; returned metadata is detached',async()=>{
 const tab={},claim=claimStructuredPosition(tab,'root/json');claim.remember(await point('one'))
 const restored=claimStructuredPosition(tab,'root/json');restored.position.ranges[0].head=77;restored.position.panes.outline.top=99
 assert.equal(claimStructuredPosition(tab,'root/json').position.ranges[0].head,1)
 assert.equal(claimStructuredPosition({},'root/json').position,undefined)
 assert.equal(claimStructuredPosition(tab,'other-root/json').position,undefined)
})
test('position fingerprints distinguish content, line endings, BOM and unpaired surrogate drafts without retaining text',async()=>{
 const values=['稿😀','稿😁','a\nb','a\r\nb','\uFEFFa','a','\uD800','\uD801','�']
 assert.equal(new Set(await Promise.all(values.map(structuredPositionDigest))).size,values.length)
 const saved=await point('private');assert.equal(JSON.stringify(saved).includes('private'),false)
})
