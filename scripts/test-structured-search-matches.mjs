import assert from 'node:assert/strict'
import {test} from 'node:test'
import {EditorState} from '@codemirror/state'
import {search,SearchQuery,setSearchQuery} from '@codemirror/search'
import {sourceSearchScopeExtensions,setSourceSearchScope,scopeFromSelection} from '../src/services/structuredSearchScope.ts'
import {buildSearchMatches,searchMatchRows} from '../src/services/structuredSearchMatches.ts'
function state(doc,query,range){
 let s=EditorState.create({doc,extensions:[search(),sourceSearchScopeExtensions,EditorState.readOnly.of(true)]})
 if(range){s=s.update({selection:{anchor:range[0],head:range[1]}}).state;s=s.update({effects:setSourceSearchScope.of(scopeFromSelection(s))}).state}
 return s.update({effects:setSearchQuery.of(new SearchQuery(query))}).state
}
test('read-only literal, flags, captures, zero-width and scoped matches use exact current source positions',()=>{
 for(const [doc,query,range,expected] of [
  ['猫😀\n猫',{search:'猫'},undefined,[[0,1],[4,5]]],
  ['CAT cat catfish',{search:'cat',caseSensitive:true,wholeWord:true},undefined,[[4,7]]],
  ['猫😀猫',{search:'(?=猫)',regexp:true},undefined,[[0,0],[3,3]]],
  ['cat cat cat',{search:'(cat).*?(cat)',regexp:true},[4,11],[[4,11]]],
 ]){const s=state(doc,query,range),p=buildSearchMatches(s).plan;assert.deepEqual(p.ranges.map(r=>[r.from,r.to]),expected);assert.equal(s.doc.toString(),doc);assert.equal(s.readOnly,true)}
})
test('no matches, invalid input and a capped result are explicit and never silently mutate text',()=>{
 for(const query of [{search:''},{search:'[',regexp:true}]){const r=buildSearchMatches(state('draft',query));assert.equal(r.plan,undefined);assert.ok(r.message)}
 const empty=buildSearchMatches(state('draft',{search:'none'})).plan;assert.deepEqual(empty.ranges,[]);assert.equal(empty.capped,false)
 for(const [doc,capped]of [['a a',false],['a a a',true]]){const p=buildSearchMatches(state(doc,{search:'a'}),2).plan;assert.equal(p.ranges.length,2);assert.equal(p.capped,capped);assert.equal(p.doc.toString(),doc)}
})
test('paging has exact line/column and bounded Unicode context even for a very long match',()=>{
 const doc=Array.from({length:45},(_,i)=>`key${i} = "猫😀"`).join('\n'),p=buildSearchMatches(state(doc,{search:'猫'})).plan
 assert.equal(searchMatchRows(p,1).length,20);assert.equal(searchMatchRows(p,3).length,5)
 assert.deepEqual(searchMatchRows(p,3)[0],{id:41,line:41,column:10,prefix:'key40 = "',suffix:'😀"',match:'猫',zeroWidth:false})
 const long=buildSearchMatches(state('😀'.repeat(300),{search:'.+',regexp:true})).plan,row=searchMatchRows(long,1)[0]
 assert.ok(row.match.length<=241&&row.match.endsWith('…'));assert.ok(!/[\uD800-\uDBFF]…$/.test(row.match));assert.equal(long.ranges[0].to,600)
 const zero=searchMatchRows(buildSearchMatches(state('猫',{search:'(?=猫)',regexp:true})).plan,1)[0];assert.equal(zero.zeroWidth,true)
})
