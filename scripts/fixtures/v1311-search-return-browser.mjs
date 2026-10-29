import './v1310-search-matches-browser.mjs'
import {contextCommands} from '/src/services/contextCommands.ts'
import {EditorView} from '@codemirror/view'
const view=()=>EditorView.findFromDOM(document.querySelector('.cm-editor'))
const command=()=>contextCommands.capture().find(c=>c.id==='structured-search-return')
structuredAudit.returnTest={
 available:()=>!!command(), run:()=>command()?.run(), capture:()=>command(),
 point:()=>{const v=view();return {ranges:v.state.selection.ranges.map(r=>({anchor:r.anchor,head:r.head})),mainIndex:v.state.selection.mainIndex,top:v.scrollDOM.scrollTop,left:v.scrollDOM.scrollLeft}},
 position:(anchor,head)=>{const v=view();v.dispatch({selection:{anchor,head},effects:EditorView.scrollIntoView(head,{y:'center'})})},
}
