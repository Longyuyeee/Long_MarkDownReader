import vm from 'node:vm'
import ts from 'typescript'
// Evaluate the shared real click implementation as well as its delegated
// handler. The UI integration tests separately exercise the mounted editor.
export function installLibraryLinkClickHarness(context,source){
 const owner={id:context.activeTabId.value,path:context.activeTabId.value,content:'source draft',isDirty:true},editor={getValue:()=>owner.content}
 context.allTabs.value.push(owner)
 Object.assign(context,{activeTextTab:{get value(){return context.activeTabId.value===owner.id?owner:undefined}},activeIsMarkdown:{value:true},isVditorReady:true,lastLoadedPath:owner.path,vditor:editor,editorLoadGeneration:0,linkNavigationTicket:0,suppressEditorInput:false,pressedLinkPosition:undefined,referenceBookmark:null,editorModeChangeBusy:{value:false},currentFileReloadBusy:{value:false},fileOperationBusy:{value:false},captureMarkdownPosition:()=>({mode:'wysiwyg',content:editor.getValue(),top:0,left:0}),rememberMarkdownSession(){},findFileFormat:()=>({id:'markdown'}),linkReturn:{push(){}}})
 const helper=source.slice(source.indexOf('const openLinkedFile ='),source.indexOf('const openNoteLink ='))
 const handler=source.slice(source.indexOf('const openSourceReference ='),source.indexOf('const openPdfReference ='))
 vm.runInNewContext(ts.transpileModule(helper+'\n'+handler+'\nglobalThis.click=openSourceReference',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context)
}
