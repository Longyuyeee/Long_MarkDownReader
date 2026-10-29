import assert from 'node:assert/strict'
import {test} from 'node:test'
import {EditorState,EditorSelection,StateEffect} from '@codemirror/state'
import {history,undo,redo} from '@codemirror/commands'
import {captureSearchReturn,locateSearchMatch,returnFromSearch,searchReturnPoints,clearSearchReturn} from '../src/services/structuredSearchReturn.ts'
const scroll=StateEffect.define({map:(value,changes)=>changes.mapPos(value)})
const fixture=()=>{
 const view={state:EditorState.create({doc:'原文0123456789\n'.repeat(20),selection:EditorSelection.single(90,83),extensions:[searchReturnPoints,history()]}),focusCount:0,
  scrollSnapshot(){return scroll.of(this.state.selection.main.head)},focus(){this.focusCount++}}
 view.dispatch=spec=>{view.state=view.state.update(spec).state};return view
}
test('a location captured before changing views keeps the original selection and semantic tree context',()=>{
 const view=fixture(),selection=view.state.selection,context={view:'tree',outline:'$.field::0',tree:'$.field::0',panes:{tree:{top:1400,left:0}}},origin=captureSearchReturn(view,context)
 view.dispatch({selection:{anchor:0}});locateSearchMatch(view,20,30,origin,'structure')
 const point=view.state.field(searchReturnPoints)[0];assert.equal(point.kind,'structure');assert.equal(point.context,context)
 returnFromSearch(view);assert.ok(view.state.selection.eq(selection));assert.equal(view.focusCount,1)
})
test('a tree-to-source change is returnable even at the same text range; repeated source locations are deduplicated',()=>{
 const view=fixture();view.dispatch({selection:{anchor:20,head:30}})
 locateSearchMatch(view,20,30,captureSearchReturn(view,{view:'source'}),'structure');assert.equal(view.state.field(searchReturnPoints).length,0)
 locateSearchMatch(view,20,30,captureSearchReturn(view,{view:'tree'}),'structure');assert.equal(view.state.field(searchReturnPoints).length,1)
})
test('normal edits map source coordinates and retain semantic view identities and bounded pane offsets',()=>{
 const view=fixture(),context={view:'tree',tree:'$.field::0',outline:'$.field::0',panes:{outline:{top:300,left:0}}}
 locateSearchMatch(view,20,30,captureSearchReturn(view,context),'structure');view.dispatch({changes:{from:0,insert:'新增'}})
 const point=view.state.field(searchReturnPoints)[0];assert.equal(point.context,context);assert.equal(point.kind,'structure');assert.equal(point.scroll.value,85)
 returnFromSearch(view);assert.equal(view.state.selection.main.anchor,92);assert.equal(view.state.selection.main.head,85)
})
test('search and structure navigation share reverse-order history without stealing a restoring tree focus',()=>{
 const view=fixture();locateSearchMatch(view,20,30,captureSearchReturn(view,{view:'source'}),'structure');locateSearchMatch(view,60,65)
 assert.equal(view.state.field(searchReturnPoints)[1].kind,'search');returnFromSearch(view,false)
 assert.equal(view.state.selection.main.from,20);assert.equal(view.focusCount,0);returnFromSearch(view,false);assert.equal(view.state.selection.main.anchor,90)
})
test('navigation still creates no text undo entry and replacing a document clears its old UI context',()=>{
 const view=fixture(),original=view.state.doc.toString();view.dispatch({changes:{from:0,insert:'草稿'},userEvent:'input'})
 const draft=view.state.doc.toString();locateSearchMatch(view,20,30,captureSearchReturn(view,{view:'tree'}),'structure');returnFromSearch(view,false)
 undo(view);assert.equal(view.state.doc.toString(),original);redo(view);assert.equal(view.state.doc.toString(),draft)
 locateSearchMatch(view,40,50,captureSearchReturn(view,{view:'tree'}),'structure');view.dispatch({effects:clearSearchReturn.of()});assert.equal(returnFromSearch(view),false)
})
