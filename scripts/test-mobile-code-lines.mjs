import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState, EditorSelection } from '@codemirror/state'
import { history, undo, redo, undoDepth } from '@codemirror/commands'
import { codeSelectedLines, codePosition, codeLineSelection, codeIndentChange } from '../src/mobile/codeLineActions.ts'
import { sourceFormat, sourceSlice } from '../src/mobile/sourceFormat.ts'
const make=(source,anchor=0,head=anchor)=>EditorState.create({doc:source,selection:EditorSelection.single(anchor,head),extensions:[history(),sourceFormat(source)]})
test('选区止于下一行行首时不调整下一行，反向选择具有相同行范围',()=>{
 for(const [anchor,head]of [[0,2],[2,0]]){const state=make('a\nb\nc',anchor,head);assert.deepEqual(codeSelectedLines(state),{first:1,last:1});assert.equal(sourceSlice(state.update(codeIndentChange(state)).state),'  a\nb\nc')}
})
test('行状态只描述位置和所选行，不创建文字历史',()=>{
 let state=make('a\nb\nc',0,3);assert.deepEqual(codePosition(state),{line:2,column:2,selectedLines:2});state=state.update(codeLineSelection(state,'end')).state;assert.deepEqual(codePosition(state),{line:2,column:2,selectedLines:0});assert.equal(sourceSlice(state),'a\nb\nc');assert.equal(undoDepth(state),0)
})
test('可见列按 Tab 和字素计数，首行 BOM 不占一列',()=>{
 const source='\uFEFF\tA😀e\u0301\r\nnext',state=make(source,7)
 assert.deepEqual(codePosition(state),{line:1,column:8,selectedLines:0});assert.equal(sourceSlice(state),source)
 for(const at of [0,1])assert.equal(codePosition(make(source,at)).column,1)
})
test('行首与选行跳过首个 BOM，行尾指向物理行尾而非视觉折行',()=>{
 const state=make('\uFEFFone\r\ntwo\n',2);assert.equal(state.update(codeLineSelection(state,'start')).state.selection.main.head,1);assert.equal(state.update(codeLineSelection(state,'end')).state.selection.main.head,4);const selected=state.update(codeLineSelection(state,'select')).state.selection.main;assert.equal(selected.from,1);assert.equal(selected.to,4);assert.equal(sourceSlice(state,selected.from,selected.to),'one')
})
test('选行保持正反向方向且不包含最后行换行，不扩展到下一行',()=>{
 for(const reverse of [false,true]){let state=make('one\r\ntwo\nthree',reverse?7:1,reverse?1:7);state=state.update(codeLineSelection(state,'select')).state;assert.equal(sourceSlice(state,state.selection.main.from,state.selection.main.to),'one\r\ntwo');assert.equal(state.selection.main.anchor>state.selection.main.head,reverse);assert.deepEqual(codeSelectedLines(state),{first:1,last:2});state=state.update(codeLineSelection(state,'select')).state;assert.deepEqual(codeSelectedLines(state),{first:1,last:2})}
})
test('增加缩进仅在每个选中物理行添加两个空格，保留 BOM、空行、Tab 与混合换行',()=>{
 const source='\uFEFFa\r\n\tb\n\r尾😎\r\n';const state=make(source,1,9);const next=state.update(codeIndentChange(state)).state;assert.equal(sourceSlice(next),'\uFEFF  a\r\n  \tb\n  \r  尾😎\r\n');assert.equal(next.selection.main.from,3)
})
test('减少缩进移除一个 Tab 或最多两个 ASCII 空格，不改其他空白和非缩进行',()=>{
 const source='\uFEFF\ta\r\n b\n  c\r   d\n\u00a0e\nplain\n';let state=make(source,1,EditorState.create({doc:source}).doc.length);state=state.update(codeIndentChange(state,true)).state;assert.equal(sourceSlice(state),'\uFEFFa\r\nb\nc\r d\n\u00a0e\nplain\n')
})
test('无可移除缩进时不创建事务和历史；空文档与仅 BOM 文档可明确缩进',()=>{
 const state=make('plain');assert.equal(codeIndentChange(state,true),undefined);assert.equal(undoDepth(state),0);for(const source of ['', '\uFEFF']){const input=make(source,source.length);assert.equal(sourceSlice(input.update(codeIndentChange(input)).state),source+'  ')}
})
test('缩进映射反向选区，一次撤销重做恢复完整源文及原换行',()=>{
 const original='\uFEFFa\r\n b\n\tc\r';let state=make(original,7,1);const dispatch=tr=>{state=tr.state};dispatch(state.update(codeIndentChange(state)));const candidate=sourceSlice(state);assert.ok(state.selection.main.anchor>state.selection.main.head);assert.equal(undo({state,dispatch}),true);assert.equal(sourceSlice(state),original);assert.equal(redo({state,dispatch}),true);assert.equal(sourceSlice(state),candidate);dispatch(state.update(codeIndentChange(state,true)));assert.equal(sourceSlice(state),original);assert.equal(undo({state,dispatch}),true);assert.equal(sourceSlice(state),candidate)
})
test('缩进与相邻键盘输入分别撤销，导航不提交草稿',()=>{
 let state=make('a\r\nb',1);const dispatch=tr=>{state=tr.state};dispatch(state.update({changes:{from:1,insert:'x'},userEvent:'input.type'}));dispatch(state.update(codeIndentChange(state)));dispatch(state.update(codeLineSelection(state,'end')));dispatch(state.update({changes:{from:state.selection.main.head,insert:'y'},userEvent:'input.type'}));assert.equal(sourceSlice(state),'  axy\r\nb');undo({state,dispatch});assert.equal(sourceSlice(state),'  ax\r\nb');undo({state,dispatch});assert.equal(sourceSlice(state),'ax\r\nb');undo({state,dispatch});assert.equal(sourceSlice(state),'a\r\nb')
})
test('一次最多调整 1000 行，超限在创建任何事务前拒绝',()=>{
 const source=Array(1001).fill('x').join('\n'),state=make(source,0,source.length);assert.throws(()=>codeIndentChange(state),/1000/);assert.equal(sourceSlice(state),source);assert.equal(undoDepth(state),0);const small=make(Array(1000).fill('x').join('\n'));const selected=small.update({selection:{anchor:0,head:small.doc.length}}).state;assert.equal(sourceSlice(selected.update(codeIndentChange(selected)).state).split('\n').every(line=>line==='  x'),true)
})
