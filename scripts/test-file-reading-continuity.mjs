import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {test} from 'node:test'
const plain = value => JSON.parse(JSON.stringify(value))
function fixture() {
 const data = new Map(), storage = {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}
 const compile = (file,deps={}) => { const exports={}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,localStorage:storage,require:name=>{assert.ok(name in deps,name);return deps[name]}});return exports }
 const styles=compile('src/utils/fileDisplayStyles.ts'), sessions=compile('src/utils/workSessions.ts')
 const moves=compile('src/services/fileMoveProtection.ts',{'../utils/fileDisplayStyles':styles,'./windowDrafts':{},'./tauriRuntime':{}})
 const views=compile('src/services/workspaceViewState.ts'), service=compile('src/services/fileReadingContinuity.ts',{'../utils/workSessions':sessions,'./fileMoveProtection':moves,'./workspaceViewState':views})
 const root='C:/Library', old=root+'/旧目录', target=root+'/新目录', path=old+'/深层/a.pdf', next=target+'/深层/a.pdf'
 const notice={root,oldPath:old,newPath:target,documents:[]}, set=(k,v)=>storage.setItem(k,JSON.stringify(v)), get=k=>JSON.parse(storage.getItem(k)||'null')
 return {data,storage,views,sessions,service,root,old,target,path,next,notice,set,get,compile}
}
const view = n=>({scrollTop:n,scrollLeft:15,section:'2',zoom:1.3,pdfAnnotations:{signature:'1200:2000',id:'annotation-1',query:'研究',pages:'2',kind:'comment',color:'blue',listPage:1,selection:['annotation-1'],scrollTop:140}})
test('folder receipt continues nested PDF, table and canvas positions with original PDF identity',()=>{
 const f=fixture(); for(const [suffix,state] of [['/深层/a.pdf',view(345)],['/b.table.json',{scrollTop:560,scrollLeft:200,frozenColumns:2}],['/c.canvas',{scrollTop:0,scrollLeft:0,zoom:2,panX:-300,panY:40}]]) f.views.rememberWorkspaceViewState(f.old+suffix,state)
 assert.equal(f.service.continueFileReading(f.notice),0)
 assert.equal(f.views.recallWorkspaceViewState(f.next).scrollTop,345);assert.equal(f.views.recallWorkspaceViewState(f.next).pdfAnnotations.signature,'1200:2000')
 assert.equal(f.views.recallWorkspaceViewState(f.target+'/b.table.json').frozenColumns,2);assert.equal(f.views.recallWorkspaceViewState(f.target+'/c.canvas').panX,-300)
 assert.equal(f.views.recallWorkspaceViewState(f.path),undefined)
 const fresh=f.compile('src/services/workspaceViewState.ts');assert.equal(fresh.recallWorkspaceViewState(f.next).scrollTop,345)
})
test('staged scene positions keep all 128 locators separate from the 24 live slots',()=>{
 const f=fixture(),paths=Array.from({length:128},(_,i)=>f.old+'/'+i+'.pdf')
 f.views.stageWorkspaceViewStates(Object.fromEntries(paths.map((p,i)=>[p,view(i+1)])),paths)
 assert.equal(f.service.continueFileReading(f.notice),0)
 assert.equal(Object.keys(f.get('longedit.session-view-state.v1')).length,128)
 for(let i=0;i<128;i++)assert.equal(f.views.recallWorkspaceViewState(f.target+'/'+i+'.pdf').scrollTop,i+1)
 assert.equal(f.storage.getItem('longedit.view-state.v1'),null)
})
test('named scenes continue tabs, active file, search locator and reference without text or draft migration',()=>{
 const f=fixture(),key=f.sessions.workSessionKey(f.root),scene={version:1,id:'scene',name:'研究现场',libraryRoot:f.root,tabs:[{id:f.path,path:f.path,title:'a.pdf',isDirty:false,pinned:true}],activeTabId:f.path,savedAt:4,importFingerprint:'original-import',views:{[f.path]:{...view(45),draft:'PRIVATE CONTENT'}},search:{query:'研究',types:['pdf'],selected:JSON.stringify([f.path,'pdf','annotation',2,null,'annotation-1',null,'PRIVATE EXCERPT']),scroll:400},reference:{path:f.path,title:'a.pdf',query:'研究',page:2,annotationId:'annotation-1'}}
 f.set(key,[scene]);f.set('longedit.reference.v1:'+encodeURIComponent('c:/library'),scene.reference);f.set('longedit.search.v1:'+encodeURIComponent('c:/library'),scene.search)
 assert.equal(f.service.continueFileReading(f.notice),0);const result=f.get(key)[0]
 assert.equal(result.tabs[0].path,f.next);assert.equal(result.tabs[0].pinned,true);assert.equal(result.activeTabId,f.next);assert.equal(result.views[f.next].scrollTop,45);assert.equal(result.reference.path,f.next);assert.equal(result.search.selection[0],f.next);assert.equal(result.importFingerprint,'original-import');assert.equal(result.savedAt,4)
 assert.ok(!f.storage.getItem(key).includes('PRIVATE'));assert.equal(f.get('longedit.search.v1:'+encodeURIComponent('c:/library')).selection[0],f.next)
})
test('partial batch receipts only continue successful paths; retries are idempotent',()=>{
 const f=fixture(),a=f.root+'/a.pdf',b=f.root+'/b.pdf',renamed=f.root+'/a-new.pdf'
 f.views.rememberWorkspaceViewState(a,view(30));f.views.rememberWorkspaceViewState(b,view(60))
 const receipt={...f.notice,oldPath:a,newPath:renamed};f.service.continueFileReading(receipt);const snapshot=[...f.data]
 assert.equal(f.service.continueFileReading(receipt),0);assert.deepEqual([...f.data],snapshot);assert.equal(f.views.recallWorkspaceViewState(b).scrollTop,60);assert.equal(f.views.recallWorkspaceViewState(renamed).scrollTop,30)
 f.service.continueFileReading({...receipt,oldPath:b,newPath:f.root+'/b-new.pdf'});assert.equal(f.views.recallWorkspaceViewState(f.root+'/b-new.pdf').scrollTop,60)
})
test('late unmount writes cannot resurrect the old bookmark or block undo; reopening a reused path creates a new owner',()=>{
 const f=fixture();f.views.rememberWorkspaceViewState(f.path,view(30));f.service.continueFileReading(f.notice)
 f.views.rememberWorkspaceViewState(f.path,view(1));assert.equal(f.get('longedit.view-state.v1')[f.path],undefined)
 f.views.rememberWorkspaceViewState(f.next,view(700));f.service.continueFileReading({...f.notice,oldPath:f.target,newPath:f.old})
 assert.equal(f.views.recallWorkspaceViewState(f.path).scrollTop,700)
 f.views.recallWorkspaceViewState(f.next);f.views.rememberWorkspaceViewState(f.next,view(3));assert.equal(f.views.recallWorkspaceViewState(f.next).scrollTop,3)
})
test('destination collision preserves both records; drafts stay at their original owner',()=>{
 const f=fixture();f.views.rememberWorkspaceViewState(f.path,{...view(30),draft:'UNSAVED',selection:'CELL DRAFT'});f.views.rememberWorkspaceViewState(f.next,view(90))
 assert.ok(f.service.continueFileReading(f.notice)>0);assert.equal(f.views.recallWorkspaceViewState(f.next).scrollTop,90);assert.equal(f.views.recallWorkspaceViewState(f.path).draft,'UNSAVED')
 const g=fixture();g.views.rememberWorkspaceViewState(g.path,{...view(30),draft:'UNSAVED'});g.service.continueFileReading(g.notice);assert.equal(g.views.recallWorkspaceViewState(g.next).draft,undefined);assert.equal(g.views.recallWorkspaceViewState(g.path).draft,'UNSAVED');assert.ok(![...g.data.values()].join('').includes('UNSAVED'))
})
test('Windows and UNC aliases continue; siblings, other roots and content-only notices do not move',()=>{
 const f=fixture();f.views.rememberWorkspaceViewState('\\\\?\\C:\\Library\\旧目录\\深层\\a.pdf',view(30));f.views.rememberWorkspaceViewState(f.old+'2/sibling.pdf',view(70));f.service.continueFileReading(f.notice)
 assert.equal(f.views.recallWorkspaceViewState(f.next.toUpperCase()).scrollTop,30);assert.equal(f.views.recallWorkspaceViewState(f.old+'2/sibling.pdf').scrollTop,70)
 const before=[...f.data];f.service.continueFileReading({...f.notice,newPath:'C:/Elsewhere/a'});f.service.continueFileReading({...f.notice,contentOnly:true});assert.deepEqual([...f.data],before)
 const n={root:'//server/share',oldPath:'//server/share/old',newPath:'//server/share/new',documents:[]};f.views.rememberWorkspaceViewState('\\\\?\\UNC\\server\\share\\old\\a.pdf',view(31));f.service.continueFileReading(n);assert.equal(f.views.recallWorkspaceViewState('//server/share/new/a.pdf').scrollTop,31)
})
test('legacy PDF bookmarks follow their own library only',()=>{
 const f=fixture();f.set('longedit.pdf.positions.v1',{[f.root+'\n'+f.path]:8,['external\n'+f.path]:3});f.service.continueFileReading(f.notice);assert.equal(f.get('longedit.pdf.positions.v1')[f.root+'\n'+f.next],8);assert.equal(f.get('longedit.pdf.positions.v1')['external\n'+f.path],3)
})
test('canonical native root receipts update scenes stored with the configured ordinary root',()=>{
 const f=fixture(),key=f.sessions.workSessionKey(f.root)
 f.set(key,[{version:1,id:'canonical',name:'接续',libraryRoot:f.root,tabs:[{id:f.path,path:f.path,title:'a.pdf',isDirty:false}],activeTabId:f.path,savedAt:1}])
 const target='\\\\?\\C:\\Library\\新目录'
 f.service.continueFileReading({...f.notice,root:'\\\\?\\C:\\Library',oldPath:'\\\\?\\C:\\Library\\旧目录',newPath:target})
 assert.equal(f.get(key)[0].tabs[0].path,target+'\\深层\\a.pdf')
})
test('corrupt and quota-blocked records preserve raw data while the current view continues',()=>{
 const f=fixture();f.storage.setItem(f.sessions.workSessionKey(f.root),'broken scene');f.views.rememberWorkspaceViewState(f.path,view(10));const raw=f.storage.getItem('longedit.view-state.v1');f.storage.setItem=()=>{throw Error('quota')}
 assert.ok(f.service.continueFileReading(f.notice)>0);assert.equal(f.storage.getItem(f.sessions.workSessionKey(f.root)),'broken scene');assert.equal(f.storage.getItem('longedit.view-state.v1'),raw);assert.equal(f.views.recallWorkspaceViewState(f.next).scrollTop,10)
})
