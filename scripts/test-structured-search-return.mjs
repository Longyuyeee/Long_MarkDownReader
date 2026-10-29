import assert from 'node:assert/strict'
import {test} from 'node:test'
import {EditorState,EditorSelection,StateEffect} from '@codemirror/state'
import {history,undo,redo} from '@codemirror/commands'
import {locateSearchMatch,returnFromSearch,searchReturnPoints,clearSearchReturn,SEARCH_RETURN_LIMIT} from '../src/services/structuredSearchReturn.ts'
const scroll=StateEffect.define({map:(value,changes)=>changes.mapPos(value)})
const fixture=(selection=EditorSelection.single(10,3),readOnly=false)=>{
 const view={state:EditorState.create({doc:'0123456789\n'.repeat(8),selection,extensions:[searchReturnPoints,history(),EditorState.allowMultipleSelections.of(true),EditorState.readOnly.of(readOnly)]}),focusCount:0,
  dispatch(spec){this.state=this.state.update(spec).state},scrollSnapshot(){return scroll.of(this.state.selection.main.head)},focus(){this.focusCount++}}
 view.dispatch=view.dispatch.bind(view);return view
}
test('return restores the full directed selection, consumes the position and never edits the document',()=>{
 const view=fixture(),original=view.state.selection,doc=view.state.doc
 locateSearchMatch(view,50,55);assert.equal(view.state.field(searchReturnPoints).length,1)
 assert.equal(returnFromSearch(view),true);assert.ok(view.state.selection.eq(original));assert.equal(view.state.doc,doc);assert.equal(view.focusCount,1)
 assert.equal(returnFromSearch(view),false);assert.equal(view.focusCount,1)
})
test('multi-selection and its main range survive navigation',()=>{
 const original=EditorSelection.create([EditorSelection.range(2,5),EditorSelection.range(17,13)],1),view=fixture(original)
 locateSearchMatch(view,60,63);returnFromSearch(view);assert.ok(view.state.selection.eq(original));assert.equal(view.state.selection.mainIndex,1)
})
test('consecutive navigation returns in reverse order and history is bounded',()=>{
 const view=fixture();locateSearchMatch(view,30,33);locateSearchMatch(view,50,53)
 returnFromSearch(view);assert.equal(view.state.selection.main.from,30);returnFromSearch(view);assert.equal(view.state.selection.main.from,3)
 for(let i=0;i<SEARCH_RETURN_LIMIT+10;i++)locateSearchMatch(view,i+20,i+21)
 assert.equal(view.state.field(searchReturnPoints).length,SEARCH_RETURN_LIMIT)
})
test('an identical target creates no redundant return position, including zero-width matches',()=>{
 const view=fixture(EditorSelection.single(10));locateSearchMatch(view,10,10);assert.equal(view.state.field(searchReturnPoints).length,0)
 locateSearchMatch(view,30,30);returnFromSearch(view);assert.equal(view.state.selection.main.head,10)
})
test('edits map the selection and scroll anchor; deleted positions are discarded',()=>{
 const view=fixture();locateSearchMatch(view,50,55);view.dispatch({changes:{from:0,insert:'新增'}})
 const point=view.state.field(searchReturnPoints)[0];assert.equal(point.scroll.value,5)
 returnFromSearch(view);assert.equal(view.state.selection.main.anchor,12);assert.equal(view.state.selection.main.head,5)
 locateSearchMatch(view,50,55);view.dispatch({changes:{from:3,to:15}});assert.equal(view.state.field(searchReturnPoints).length,0)
})
test('navigation and returning do not add text undo steps or remove redo',()=>{
 const view=fixture(),original=view.state.doc.toString();view.dispatch({changes:{from:0,insert:'草稿'},userEvent:'input'})
 const draft=view.state.doc.toString();locateSearchMatch(view,50,55);returnFromSearch(view)
 undo(view);assert.equal(view.state.doc.toString(),original);redo(view);assert.equal(view.state.doc.toString(),draft)
})
test('read-only navigation still restores selection without editing',()=>{
 const view=fixture(undefined,true),doc=view.state.doc;locateSearchMatch(view,50,55);assert.equal(returnFromSearch(view),true);assert.equal(view.state.doc,doc);assert.equal(view.state.readOnly,true)
})
test('replacement and fresh document state have no coordinates from the previous owner',()=>{
 const view=fixture();locateSearchMatch(view,50,55);view.dispatch({effects:clearSearchReturn.of()});assert.equal(returnFromSearch(view),false)
 locateSearchMatch(view,10,12);view.state=EditorState.create({doc:'other',extensions:[searchReturnPoints]});assert.equal(returnFromSearch(view),false)
})
