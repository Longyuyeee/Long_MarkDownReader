import assert from 'node:assert/strict'
import {test} from 'node:test'
import {EditorState} from '@codemirror/state'
import {history,undo,redo} from '@codemirror/commands'
import {search,SearchQuery,setSearchQuery,getSearchQuery,findNext,findPrevious,selectMatches,replaceNext,replaceAll} from '@codemirror/search'
import {scopeFromSelection,setSourceSearchScope,sourceSearchScope,sourceSearchScopeExtensions} from '../src/services/structuredSearchScope.ts'

function editor(doc='x cat cat cat x',readOnly=false){
 const view={state:EditorState.create({doc,extensions:[search(),history(),EditorState.allowMultipleSelections.of(true),EditorState.readOnly.of(readOnly),sourceSearchScopeExtensions]})}
 view.plugin=()=>null;view.dispatch=spec=>{view.state=view.state.update(spec).state};return view
}
function query(v,config={}){v.dispatch({effects:setSearchQuery.of(new SearchQuery({search:'cat',replace:'kitten',...config}))})}
function scope(v,from,to){v.dispatch({selection:{anchor:from,head:to}});v.dispatch({effects:setSourceSearchScope.of(scopeFromSelection(v.state))})}
const ranges=v=>Array.from(getSearchQuery(v.state).getCursor(v.state)).map(({from,to})=>[from,to])

test('selection remains ordinary full-document search until explicitly enabled',()=>{
 const v=editor();query(v);v.dispatch({selection:{anchor:2,head:5}});assert.equal(ranges(v).length,3)
 scope(v,6,9);assert.deepEqual(ranges(v),[[6,9]])
 v.dispatch({effects:setSourceSearchScope.of(scopeFromSelection(v.state,false))});assert.equal(ranges(v).length,3)
})
test('all native navigation, select and replacement commands honor the scope',()=>{
 const v=editor();query(v);scope(v,6,13);assert.deepEqual(ranges(v),[[6,9],[10,13]])
 findNext(v);assert.equal(v.state.selection.main.from,6);findNext(v);assert.equal(v.state.selection.main.from,10)
 findNext(v);assert.equal(v.state.selection.main.from,6);findPrevious(v);assert.equal(v.state.selection.main.from,10)
 selectMatches(v);assert.deepEqual(v.state.selection.ranges.map(r=>[r.from,r.to]),[[6,9],[10,13]])
 replaceNext(v);assert.equal(v.state.doc.toString(),'x cat kitten cat x')
 replaceAll(v);assert.equal(v.state.doc.toString(),'x cat kitten kitten x')
 assert.equal(undo(v),true);assert.equal(v.state.doc.toString(),'x cat kitten cat x')
 assert.equal(redo(v),true);assert.equal(v.state.doc.toString(),'x cat kitten kitten x')
})
test('ranges map through inserts at and inside boundaries and restore exactly with undo/redo',()=>{
 const v=editor();query(v);scope(v,6,13)
 for(const change of [{from:0,insert:'prefix '},{from:13,insert:'inside '},{from:27,insert:'edge '}]){
  const before={...v.state.field(sourceSearchScope).range};v.dispatch({changes:change,userEvent:'input'})
  const after={...v.state.field(sourceSearchScope).range};undo(v);assert.deepEqual(v.state.field(sourceSearchScope).range,before)
  redo(v);assert.deepEqual(v.state.field(sourceSearchScope).range,after)
 }
})
test('deleted or empty scopes block outside matches; undo restores the deleted range',()=>{
 const v=editor();query(v);scope(v,6,13);v.dispatch({changes:{from:6,to:13}})
 assert.equal(v.state.field(sourceSearchScope).reason,'changed');assert.deepEqual(ranges(v),[])
 const body=v.state.doc.toString();replaceAll(v);assert.equal(v.state.doc.toString(),body)
 undo(v);assert.deepEqual(v.state.field(sourceSearchScope).range,{from:6,to:13});assert.equal(ranges(v).length,2)
 v.dispatch({selection:{anchor:0}});v.dispatch({effects:setSourceSearchScope.of(scopeFromSelection(v.state))})
 assert.equal(v.state.field(sourceSearchScope).reason,'empty');assert.deepEqual(ranges(v),[])
})
test('later explicit scope choices win over old edit history',()=>{
 for(const enabled of [false,true]){
  const v=editor();query(v);scope(v,6,13);v.dispatch({changes:{from:6,to:13}})
  if(enabled)scope(v,2,5);else v.dispatch({effects:setSourceSearchScope.of(scopeFromSelection(v.state,false))})
  const intent=v.state.field(sourceSearchScope).intent;undo(v)
  assert.equal(v.state.field(sourceSearchScope).intent,intent);assert.equal(v.state.field(sourceSearchScope).enabled,enabled)
  if(enabled)assert.deepEqual(v.state.field(sourceSearchScope).range,{from:2,to:5})
 }
})
test('regex, zero width, full words and crossing boundaries use full-document semantics',()=>{
 const v=editor('cat catfish cat\ncat');scope(v,4,15)
 query(v,{wholeWord:true});assert.deepEqual(ranges(v),[[12,15]])
 query(v,{search:'cat.*cat',regexp:true});assert.deepEqual(ranges(v),[])
 query(v,{search:'^cat',regexp:true});assert.deepEqual(ranges(v),[])
 query(v,{search:'(?=cat)',regexp:true});assert.deepEqual(ranges(v),[[4,4],[12,12]])
 query(v,{search:'[',regexp:true});assert.equal(getSearchQuery(v.state).valid,false)
})
test('read-only documents remain searchable without replacement or history changes',()=>{
 const v=editor(undefined,true);query(v);scope(v,6,13);findNext(v);assert.equal(v.state.selection.main.from,6)
 assert.equal(replaceNext(v),false);assert.equal(replaceAll(v),false);assert.equal(v.state.doc.toString(),'x cat cat cat x')
})
