import assert from 'node:assert/strict'
import {test} from 'node:test'
import {claimStructuredOutlineState} from '../src/services/structuredOutlineState.ts'
const state=(query)=>({query,selection:'$.second::0',expanded:['items','__proto__'],mode:'tree',collapsed:['$::0'],treeSelection:'$::0'})
test('open files keep independent reading state; snapshots do not share mutable expansion arrays',()=>{
 const a={},b={},first=claimStructuredOutlineState(a,'library/json');first.remember(state('second'))
 const other=claimStructuredOutlineState(b,'library/json');assert.equal(other.state.query,'');other.remember(state('third'))
 const back=claimStructuredOutlineState(a,'library/json');assert.deepEqual(back.state,state('second'));back.state.expanded.push('transient')
 assert.deepEqual(claimStructuredOutlineState(a,'library/json').state.expanded,['items','__proto__'])
 assert.equal(claimStructuredOutlineState(b,'library/json').state.query,'third')
})
test('replacement editor owns subsequent updates; a late old editor cannot overwrite it',()=>{
 const tab={},old=claimStructuredOutlineState(tab,'one');old.remember(state('old'))
 const replacement=claimStructuredOutlineState(tab,'one');replacement.remember(state('new'));old.remember(state('late'))
 assert.equal(claimStructuredOutlineState(tab,'one').state.query,'new')
})
test('rename follows the same open tab; reopening, another library or another format starts fresh',()=>{
 const tab={path:'before.json'},a=claimStructuredOutlineState(tab,'rootA/json/internal');a.remember(state('second'));tab.path='after.json'
 assert.equal(claimStructuredOutlineState(tab,'rootA/json/internal').state.query,'second')
 assert.equal(claimStructuredOutlineState({path:tab.path},'rootA/json/internal').state.query,'')
 for(const scope of ['rootB/json/internal','rootA/yaml/internal','rootA/json/external'])assert.equal(claimStructuredOutlineState(tab,scope).state.query,'')
})
