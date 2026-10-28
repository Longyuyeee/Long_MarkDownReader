import assert from 'node:assert/strict'
import {test} from 'node:test'
import {claimStructuredSearch} from '../src/services/structuredSearchState.ts'
const state={search:'草稿',replace:'更新',caseSensitive:true,regexp:false,wholeWord:true,literal:false,open:true}
test('search/replace belongs to the actual open tab and follows its rename',()=>{
 const a={path:'A.json'},b={},old=claimStructuredSearch(a,'root/json');old.remember(state)
 assert.equal(claimStructuredSearch(b,'root/json').state,undefined)
 a.path='renamed.json';assert.deepEqual(claimStructuredSearch(a,'root/json').state,state)
})
test('late previous editor cannot overwrite a new owner and metadata copies are detached',()=>{
 const tab={},old=claimStructuredSearch(tab,'root/json');old.remember(state)
 const current=claimStructuredSearch(tab,'root/json');current.state.search='changed copy'
 current.remember({...state,replace:'当前'});old.remember({...state,replace:'过期'})
 assert.equal(old.current(),false);assert.equal(claimStructuredSearch(tab,'root/json').state.replace,'当前')
})
test('root, external identity, format and a closed/reopened tab reset the state',()=>{
 for(const scope of ['other/json','root/external-json','root/yaml']){
  const tab={};claimStructuredSearch(tab,'root/json').remember(state)
  assert.equal(claimStructuredSearch(tab,scope).state,undefined)
 }
 assert.equal(claimStructuredSearch({},'root/json').state,undefined)
})
test('empty/invalid queries and explicitly closed panels are retained as user inputs',()=>{
 const tab={};claimStructuredSearch(tab,'root/json').remember({...state,search:'[',regexp:true,open:false})
 assert.deepEqual(claimStructuredSearch(tab,'root/json').state,{...state,search:'[',regexp:true,open:false})
})

test('scope bounds are detached per owner and only a digest promise accompanies them',()=>{
 const tab={},digest=Promise.resolve('fingerprint'),snapshot={...state,scope:{from:4,to:20,digest}}
 claimStructuredSearch(tab,'root/json').remember(snapshot);snapshot.scope.from=0
 const current=claimStructuredSearch(tab,'root/json');assert.equal(current.state.scope.from,4);assert.equal(current.state.scope.digest,digest)
 current.state.scope.to=100;assert.equal(claimStructuredSearch(tab,'root/json').state.scope.to,20)
 assert.equal(claimStructuredSearch(tab,'other/json').state,undefined)
})
