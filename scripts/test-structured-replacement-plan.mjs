import assert from 'node:assert/strict'
import {test} from 'node:test'
import {EditorState} from '@codemirror/state'
import {search,SearchQuery,setSearchQuery,replaceAll} from '@codemirror/search'
import {sourceSearchScopeExtensions,setSourceSearchScope,scopeFromSelection} from '../src/services/structuredSearchScope.ts'
import {buildReplacementPlan,replacementRows,selectedReplacementChanges} from '../src/services/structuredReplacementPlan.ts'
function state(doc,query,range,readonly=false){
 let s=EditorState.create({doc,extensions:[search(),sourceSearchScopeExtensions,EditorState.readOnly.of(readonly)]})
 if(range){s=s.update({selection:{anchor:range[0],head:range[1]}}).state;s=s.update({effects:setSourceSearchScope.of(scopeFromSelection(s))}).state}
 return s.update({effects:setSearchQuery.of(new SearchQuery(query))}).state
}
function native(s){const view={state:s,dispatch:spec=>{view.state=view.state.update(spec).state}};replaceAll(view);return view.state.doc.toString()}
test('preview matches native literal, case, words, escaped/literal newline, captures and zero-width replacements',()=>{
 for(const [doc,query,range]of [
  ['cat cat cat',{search:'cat',replace:'dog'},undefined],
  ['CAT cat catfish',{search:'cat',replace:'dog',wholeWord:true},undefined],
  ['CAT cat catfish',{search:'cat',replace:'dog',caseSensitive:true},undefined],
  ['a\nb\n',{search:'\\n',replace:'\\t'},undefined],
  ['a\\nb\\n',{search:'\\n',replace:'\\t',literal:true},undefined],
  ['cat cat cat outside',{search:'(cat).*?(cat)',replace:'$2-$1-$$-$&',regexp:true},[4,11]],
  ['cat cat cat',{search:'cat[\\s\\S]*cat',replace:'replacement',regexp:true},[4,11]],
  ['😀猫😀猫',{search:'(?=猫)',replace:'点',regexp:true},undefined],
  ['a b',{search:'a',replace:'x\\r\\ny'},undefined],
 ]){
  const s=state(doc,query,range),result=buildReplacementPlan(s);assert.ok(result.plan,JSON.stringify({doc,query,range,result}))
  assert.equal(s.doc.toString(),doc);assert.equal(result.plan.changes.apply(s.doc).toString(),native(s))
 }
})
test('preview preserves source and makes no plan for empty, invalid, unchanged, missing or readonly matches',()=>{
 for(const [query,readonly]of [[{search:'',replace:'b'},false],[{search:'[',regexp:true},false],[{search:'a',replace:'a'},false],[{search:'missing',replace:'b'},false],[{search:'a',replace:'b'},true]]){
  const s=state('a',query,undefined,readonly),r=buildReplacementPlan(s);assert.equal(r.plan,undefined);assert.ok(r.message);assert.equal(s.doc.toString(),'a')
 }
})
test('bounded preview lists only actual changes; edits can be applied without touching outside text',()=>{
 const s=state('CAT cat cat',{search:'cat',replace:'CAT'},[4,11]),r=buildReplacementPlan(s)
 assert.equal(r.plan.edits.length,2);assert.equal(r.plan.changes.apply(s.doc).toString(),'CAT CAT CAT')
 const partial=buildReplacementPlan(state('CAT cat',{search:'cat',replace:'CAT'}));assert.equal(partial.plan.unchanged,1);assert.equal(partial.plan.edits.length,1)
})
test('match and changed-text budgets reject the whole preview rather than offering a partial replacement',()=>{
 for(const limits of [{matches:2,changedText:100,insertedText:100},{matches:100,changedText:2,insertedText:100},{matches:100,changedText:100,insertedText:2}]){
  const s=state('a a a',{search:'a',replace:'long'}),r=buildReplacementPlan(s,limits);assert.equal(r.plan,undefined);assert.match(r.message,/缩小选区/);assert.equal(s.doc.toString(),'a a a')
 }
})
test('row pagination and compact Unicode snippets are bounded and contain no replacement command side effects',()=>{
 const s=state(Array.from({length:45},(_,i)=>`key${i} = "猫😀"`).join('\n'),{search:'猫',replace:'狗'})
 const p=buildReplacementPlan(s).plan;assert.equal(replacementRows(p,1).length,20);assert.equal(replacementRows(p,2)[0].id,21);assert.equal(replacementRows(p,3).length,5)
 assert.deepEqual(replacementRows(p,3)[0],{id:41,line:41,column:10,prefix:'key40 = "',suffix:'😀"',before:'猫',after:'狗',insertion:false,deletion:false})
 const long=buildReplacementPlan(state('😀'.repeat(300),{search:'.+',replace:'😀'.repeat(300),regexp:true}));assert.equal(long.plan,undefined)
 const replacement=buildReplacementPlan(state('a',{search:'a',replace:'😀'.repeat(300)})).plan
 assert.ok(replacementRows(replacement,1)[0].after.endsWith('…'));assert.ok(!/[\uD800-\uDBFF]…$/.test(replacementRows(replacement,1)[0].after))
})

test('short malformed Unicode drafts are shown faithfully rather than silently truncated',()=>{
 const proposal=buildReplacementPlan(state('old\ud800',{search:'old',replace:'new\ud800'})).plan
 const row=replacementRows(proposal,1)[0];assert.equal(row.after,'new\ud800');assert.equal(row.suffix,'\ud800')
})

test('selected changes preserve skipped positions across pages, captures, Unicode and newlines',()=>{
 const source=Array.from({length:45},(_,i)=>`项目${i}: 猫😀${i}`).join('\n')
 const proposal=buildReplacementPlan(state(source,{search:'猫😀(\\d+)',replace:'保留$1\\n新增',regexp:true})).plan
 const omitted=new Set([0,20,44]),changes=selectedReplacementChanges(proposal,omitted)
 const expected=source.replace(/猫😀(\d+)/g,(text,i)=>omitted.has(Number(i))?text:`保留${i}\n新增`)
 assert.equal(changes.apply(proposal.doc).toString(),expected)
 assert.equal(proposal.doc.toString(),source);assert.equal(proposal.edits.length,45)
 assert.equal(changes.invert(proposal.doc).apply(changes.apply(proposal.doc)).toString(),source)
 assert.equal(replacementRows(proposal,2)[0].id,21)
})
test('all selected reuses the plan; none or invalid selections cannot produce partial changes',()=>{
 const proposal=buildReplacementPlan(state('a a a',{search:'a',replace:'b'})).plan
 assert.equal(selectedReplacementChanges(proposal,new Set()),proposal.changes)
 for(const excluded of [new Set([0,1,2]),new Set([-1]),new Set([3]),new Set([.5]),new Set([NaN])])assert.equal(selectedReplacementChanges(proposal,excluded),undefined)
 const first=selectedReplacementChanges(proposal,new Set([1,2]));assert.equal(first.apply(proposal.doc).toString(),'b a a')
 const zero=buildReplacementPlan(state('😀猫😀猫',{search:'(?=猫)',replace:'点',regexp:true})).plan
 assert.equal(selectedReplacementChanges(zero,new Set([0])).apply(zero.doc).toString(),'😀猫😀点猫')
})
