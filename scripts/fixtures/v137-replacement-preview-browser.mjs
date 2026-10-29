import './v134-source-position-browser.mjs'
import {EditorView} from '@codemirror/view'
import {SearchQuery,getSearchQuery,setSearchQuery} from '@codemirror/search'
import {scopeFromSelection,setSourceSearchScope} from '/src/services/structuredSearchScope.ts'
import {isolateHistory} from '@codemirror/commands'
const view=()=>EditorView.findFromDOM(document.querySelector('.cm-editor'))
// Fixture-only hooks exercise changes arriving while the modal owns focus.
// IPC/disk remain mocked, so these are never installed-application evidence.
structuredAudit.previewTest={
 query(patch){const v=view();v.dispatch({effects:setSearchQuery.of(new SearchQuery({...getSearchQuery(v.state),...patch}))})},
 edit(changes){view().dispatch({changes,annotations:isolateHistory.of('full'),userEvent:'input'})},
 scope(){const v=view(),offset=['json','xml'].includes(structuredAudit.mode)?1:0;v.dispatch({selection:{anchor:v.state.doc.line(4+offset).from,head:v.state.doc.line(7+offset).from}});v.dispatch({effects:setSourceSearchScope.of(scopeFromSelection(v.state))})},
 tryApply(){const pending=[document.querySelector('#app')._vnode],seen=new Set();while(pending.length){const node=pending.pop();if(!node||typeof node!=='object'||seen.has(node))continue;seen.add(node);if(node.props?.search?.applyPreview)return node.props.search.applyPreview();if(node.component)pending.push(node.component.subTree);if(Array.isArray(node.children))pending.push(...node.children);if(node.suspense)pending.push(node.suspense.activeBranch)}throw Error('Preview controller not found')},
}
