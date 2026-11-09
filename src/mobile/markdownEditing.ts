import {StateField,type EditorState} from '@codemirror/state'
import {Decoration,EditorView} from '@codemirror/view'
import {HighlightStyle,syntaxHighlighting} from '@codemirror/language'
import {markdownLanguage} from '@codemirror/lang-markdown'
import {tags} from '@lezer/highlight'

const colors=HighlightStyle.define([
 {tag:tags.heading,color:'var(--ink)'},
 {tag:[tags.heading1,tags.heading2,tags.heading3,tags.heading4,tags.heading5,tags.heading6],color:'var(--primary)',fontWeight:'700'},
 {tag:tags.quote,color:'var(--primary)'},
 {tag:tags.strong,fontWeight:'700'},
 {tag:tags.emphasis,fontStyle:'italic'},
 {tag:[tags.link,tags.url],color:'var(--primary)',textDecoration:'underline'},
 {tag:tags.monospace,fontFamily:'"SFMono-Regular",Consolas,monospace',fontSize:'.875em'},
 {tag:tags.processingInstruction,color:'var(--primary)'}
])
// Keep the original BOM and all source offsets. CommonMark treats a BOM before
// the first # as text; style that source heading without changing text/history.
function firstHeading(state:EditorState){
 const line=state.doc.line(1)
 return /^\uFEFF#{1,6}(?:\s|$)/.test(line.text)?Decoration.set([Decoration.mark({class:'cm-md-bom-heading'}).range(line.from,line.to)]):Decoration.none
}
const bomHeading=StateField.define({create:firstHeading,update:(value,transaction)=>transaction.docChanged?firstHeading(transaction.state):value,provide:field=>EditorView.decorations.from(field)})
export const markdownEditing=[markdownLanguage,syntaxHighlighting(colors),bomHeading]
