import {computed,effectScope,nextTick} from 'vue'
import {EditorState} from '@codemirror/state'
import {EditorView} from '@codemirror/view'
import {useStructuredSearch} from '/src/composables/useStructuredSearch.ts'
import {locateSearchMatch} from '/src/services/structuredSearchReturn.ts'
import {contextCommands} from '/src/services/contextCommands.ts'
// Real CodeMirror/Vue, including a menu evaluated before an unverified draft is
// bound. No signature, route or loading change can incidentally refresh it.
const scope=effectScope();let controller,editor,cached
scope.run(()=>{
 controller=useStructuredSearch({ready:()=>true,context:()=> 'owned-unverified-draft'})
 cached=computed(()=>contextCommands.capture().find(command=>command.id==='structured-search-return'))
 if(cached.value)throw Error('A fresh document has no return action')
})
try{
 editor=new EditorView({state:EditorState.create({doc:'草稿\n'.repeat(50),extensions:controller.extension}),parent:document.querySelector('#probe')})
 controller.bind(editor,{},'owned',false,'json')
 locateSearchMatch(editor,20,25);await nextTick()
 if(!cached.value)throw Error('The cached document menu did not observe the new return position')
 await cached.value.run();await nextTick()
 if(cached.value)throw Error('The consumed return command is still shown')
 window.probeResult={status:'passed',cachedBeforeBinding:true,signatureAndRouteUnchanged:true,actualVueAndCodeMirror:true}
}catch(error){window.probeResult={status:'failed',error:String(error.stack||error)}}finally{controller.dispose();editor?.destroy();scope.stop()}
