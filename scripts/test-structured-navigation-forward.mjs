import assert from 'node:assert/strict'
import {test} from 'node:test'
import {EditorState,EditorSelection,StateEffect} from '@codemirror/state'
import {history,undo,redo} from '@codemirror/commands'
import {captureSearchReturn,locateSearchMatch,returnFromSearch,forwardFromSearch,searchReturnPoints,searchForwardPoints,clearSearchReturn,SEARCH_RETURN_LIMIT} from '../src/services/structuredSearchReturn.ts'
const scroll=StateEffect.define({map:(value,changes)=>changes.mapPos(value)})
const fixture=()=>{
 const v={state:EditorState.create({doc:'原文0123456789\n'.repeat(30),selection:EditorSelection.single(90,83),extensions:[searchReturnPoints,searchForwardPoints,history(),EditorState.allowMultipleSelections.of(true)]}),focusCount:0,
  scrollSnapshot(){return scroll.of(this.state.selection.main.head)},focus(){this.focusCount++}}
 v.dispatch=spec=>{v.state=v.state.update(spec).state};return v
}
const depths=v=>[v.state.field(searchReturnPoints).length,v.state.field(searchForwardPoints).length]

test('back then forward restores the exact destination while retaining the original directed multi-selection',()=>{
 const v=fixture();v.dispatch({selection:EditorSelection.create([EditorSelection.range(90,83),EditorSelection.range(110,120)],1)})
 const origin=v.state.selection;locateSearchMatch(v,20,30);returnFromSearch(v,false)
 assert.ok(v.state.selection.eq(origin));assert.deepEqual(depths(v),[0,1]);assert.equal(v.state.field(searchForwardPoints)[0].scroll.value,30)
 assert.equal(forwardFromSearch(v,false),true);assert.equal(v.state.selection.main.anchor,20);assert.equal(v.state.selection.main.head,30)
 returnFromSearch(v,false);assert.ok(v.state.selection.eq(origin));assert.equal(v.focusCount,0)
})
test('a sequence can travel both ways without losing intermediate locations or exceeding the shared limit',()=>{
 const v=fixture();for(let i=1;i<=30;i++)locateSearchMatch(v,i*5,i*5+1)
 assert.deepEqual(depths(v),[SEARCH_RETURN_LIMIT,0])
 for(let i=0;i<20;i++){assert.equal(returnFromSearch(v,false),true);assert.equal(depths(v).reduce((a,b)=>a+b),20)}
 assert.equal(returnFromSearch(v,false),false)
 for(let i=0;i<20;i++){assert.equal(forwardFromSearch(v,false),true);assert.equal(depths(v).reduce((a,b)=>a+b),20)}
 assert.equal(forwardFromSearch(v,false),false);assert.equal(v.state.selection.main.anchor,150)
})
test('actively locating another result replaces the forward branch; a duplicate location does not consume it',()=>{
 const v=fixture();locateSearchMatch(v,20,30);returnFromSearch(v,false)
 const r=v.state.selection.main;locateSearchMatch(v,r.anchor,r.head);assert.deepEqual(depths(v),[0,1])
 locateSearchMatch(v,60,65,captureSearchReturn(v,{view:'source'}),'structure');assert.deepEqual(depths(v),[1,0]);assert.equal(forwardFromSearch(v),false)
})
test('ordinary edits map forward locations and deleted destinations are removed before navigation',()=>{
 const v=fixture();locateSearchMatch(v,20,30);returnFromSearch(v,false);v.dispatch({changes:{from:0,insert:'新增'}})
 forwardFromSearch(v,false);assert.equal(v.state.selection.main.anchor,22);assert.equal(v.state.selection.main.head,32)
 returnFromSearch(v,false);v.dispatch({changes:{from:20,to:35}});assert.deepEqual(depths(v),[0,0]);assert.equal(forwardFromSearch(v),false)
})
test('tree and source contexts follow each position rather than the direction of travel',()=>{
 const v=fixture(),tree={view:'tree',tree:'$.field',panes:{tree:{top:1200,left:0}}},source={view:'source',outline:'$.field'}
 locateSearchMatch(v,20,30,captureSearchReturn(v,tree),'structure');returnFromSearch(v,false,captureSearchReturn(v,source))
 assert.equal(v.state.field(searchForwardPoints)[0].context,source)
 forwardFromSearch(v,false,captureSearchReturn(v,tree));assert.equal(v.state.field(searchReturnPoints)[0].context,tree)
 assert.equal(v.state.field(searchReturnPoints)[0].kind,'structure')
})
test('navigation creates no text undo step and clearing a document also clears a forward-only history',()=>{
 const v=fixture(),original=v.state.doc.toString();v.dispatch({changes:{from:0,insert:'草稿'},userEvent:'input'})
 const draft=v.state.doc.toString();locateSearchMatch(v,20,30);returnFromSearch(v,false);forwardFromSearch(v,false);returnFromSearch(v,false)
 undo(v);assert.equal(v.state.doc.toString(),original);redo(v);assert.equal(v.state.doc.toString(),draft)
 v.dispatch({effects:clearSearchReturn.of()});assert.deepEqual(depths(v),[0,0]);assert.equal(forwardFromSearch(v),false)
})
