import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {test} from 'node:test'
import ts from 'typescript'
import {Text} from '@codemirror/state'
import * as savepoints from '../src/services/structuredSavepoints.ts'
import {jsonPathToPointer} from '../src/utils/structuredPaths.ts'
const box=value=>({value}),deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
function harness(){
 const analysis=deferred(),write=deferred(),confirmation=deferred(),calls=[],disposers=[],errors=[];let doc='{"value":"保存的内容"}',pending=0,loads=0
 const editor={focusCount:0,focus(){editor.focusCount++},state:{get doc(){return Text.of(doc.split('\n'))}},dispatch:change=>{const c=change.changes;doc=doc.slice(0,c.from)+c.insert+doc.slice(c.to);editor.lastChange=change}}
 const opts={path:()=>opts.file,external:()=>false,format:()=> 'json',generation:()=>opts.epoch,editor:()=>editor,file:'C:/ui/A.json',epoch:1,store:{libraryPath:'C:/ui',tabs:[],addTab(tab){if(!this.tabs.some(t=>t.path===tab.path))this.tabs.push(tab)}},loading:box(false),saving:box(false),dirty:box(true),signature:box('A-1'),encoding:box('utf-8'),fileSize:box(1),modified:box(1),readOnlyReason:box(''),dialog:{},message:{info(){},success(){},warning(){},error:e=>errors.push(e)},analyze:()=>analysis.promise,clearAnalysis(){},scheduleAnalysis(){},applySnapshot:async()=>{},load:async()=>{loads++}}
 const ctx=vm.createContext({exports:{},Promise,document:{body:{inert:false}},window:{addEventListener(){},removeEventListener(){}},Element:class{},require:name=>{
  if(name==='vue')return{nextTick:fn=>Promise.resolve().then(fn),shallowRef:box,computed:fn=>({get value(){return fn()}}),onMounted(){},onBeforeUnmount:fn=>disposers.push(fn)}
  if(name==='@codemirror/commands')return{isolateHistory:{of:value=>({isolateHistory:value})}}
  if(name==='@codemirror/state')return{Text}
  if(name.includes('structuredSavepoints'))return savepoints
  // This isolated save test has no DOM. Real position restoration is covered
  // with the actual Vue/CodeMirror editors in the source-position browser suite.
  if(name.includes('useStructuredPosition'))return{useStructuredPosition:()=>({bind(){},beforeReplace(){}})}
  if(name.includes('tauriRuntime'))return{invoke:(command,args)=>{calls.push({command,args});return opts.mockInvoke?opts.mockInvoke(command,args):write.promise},listen:async()=>()=>{}}
  if(name.includes('appDialog'))return{confirmAppAction:()=>confirmation.promise}
  if(name.includes('windowDrafts'))return{beginWindowSave:()=>{pending++;return()=>pending--},recordWindowDraftActivity(){},useWindowDraft(){},useWindowDraftSnapshot(){}}
  if(name.includes('fileDisplayStyles')){const scope={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/fileDisplayStyles.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,scope);return scope.exports}
  throw Error(name)
 }})
 vm.runInContext(ts.transpileModule(fs.readFileSync('src/composables/useStructuredSession.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,ctx)
 const session=ctx.exports.useStructuredSession(opts);session.bind()
 return{session,opts,analysis,write,confirmation,calls,errors,focusCount:()=>editor.focusCount,edit:value=>{doc=value;session.refreshDirty()},text:()=>doc,pending:()=>pending,loads:()=>loads,dispose:()=>disposers.forEach(fn=>fn())}
}

test('trusted read baseline clears only exact source restoration and not later changed text',()=>{
 const h=harness(),original=h.text();h.session.bind({content:original,signature:'A-1',encoding:'utf-8'});assert.equal(h.opts.dirty.value,false)
 h.edit(original+' ');assert.equal(h.opts.dirty.value,true);h.edit(original);assert.equal(h.opts.dirty.value,false);assert.equal(h.opts.store.tabs[0].isDirty,false)
 h.opts.encoding.value='utf-16le';h.session.refreshDirty();assert.equal(h.opts.dirty.value,true)
})
test('return to old baseline during pending save remains protected until the real receipt',async()=>{
 const h=harness(),original=h.text();h.session.bind({content:original,signature:'A-1',encoding:'utf-8'});h.edit('submitted');const run=h.session.save();h.analysis.resolve({valid:true});await new Promise(resolve=>setImmediate(resolve));h.edit(original)
 assert.equal(h.opts.dirty.value,true);assert.equal(h.opts.store.tabs[0].isDirty,true);assert.equal(h.pending(),1)
 h.write.resolve({content:'submitted',signature:'A-2',encoding:'utf-8'});await run;assert.equal(h.opts.dirty.value,true);assert.equal(h.text(),original);h.edit('submitted');assert.equal(h.opts.dirty.value,false)
})
test('confirmed external modification invalidates the old read baseline',async()=>{
 const h=harness(),original=h.text();h.session.bind({content:original,signature:'A-1',encoding:'utf-8'});h.edit('unsaved');const run=h.session.save();h.analysis.resolve({valid:true});await new Promise(resolve=>setImmediate(resolve));h.write.reject({code:'external-modified'});await run
 h.edit(original);assert.equal(h.opts.dirty.value,true);assert.equal(h.opts.store.tabs[0].isDirty,true);assert.ok(h.session.conflict.value)
})
test('history restoration to the trusted original source clears the dirty tab',()=>{
 const h=harness(),original=h.text();h.session.bind({content:original,signature:'A-1',encoding:'utf-8'});h.edit('changed draft');h.session.openHistory();h.session.applyHistoryDraft(original,false,h.text());assert.equal(h.opts.dirty.value,false);assert.equal(h.opts.store.tabs[0].isDirty,false)
})
test('trusted read-only range snapshot stays clean without claiming an editable savepoint',()=>{
 const h=harness();h.opts.signature.value='';h.opts.readOnlyReason.value='large-file-range';h.opts.dirty.value=false
 h.session.bind({content:h.text(),signature:'',encoding:'utf-8',readOnlyReason:'large-file-range'});assert.equal(h.opts.dirty.value,false);assert.equal(h.opts.store.tabs[0].isDirty,false)
 h.opts.readOnlyReason.value='';h.edit('unknown draft');h.edit('{"value":"保存的内容"}');assert.equal(h.opts.dirty.value,true)
})
test('input in the previous visible editor stays dirty while the requested target is loading',async()=>{
 const h=harness(),original=h.text();h.session.bind({content:original,signature:'A-1',encoding:'utf-8'});h.opts.file='C:/ui/B.json';h.opts.epoch++;h.opts.loading.value=true;h.edit('typed during target read')
 assert.equal(h.opts.store.tabs[0].content,'typed during target read');assert.equal(h.opts.store.tabs[0].isDirty,true);assert.equal(h.opts.dirty.value,true);h.opts.loading.value=false;await h.session.save();assert.equal(h.calls.length,0)
})
test('continued input in a previous editor cannot replace its detached save receipt metadata',async()=>{
 const h=harness(),original=h.text();h.session.bind({content:original,signature:'A-1',encoding:'utf-8'});h.edit('submitted');const run=h.session.save();h.analysis.resolve({valid:true});await new Promise(resolve=>setImmediate(resolve));h.opts.file='C:/ui/B.json';h.opts.epoch++;h.opts.loading.value=true;h.edit('later input')
 h.write.resolve({content:'submitted',signature:'A-2',encoding:'utf-8'});await run;h.edit('still typing');assert.equal(h.opts.store.tabs[0].content,'still typing');assert.equal(h.opts.store.tabs[0].textSignature,'A-2');assert.equal(h.opts.store.tabs[0].isDirty,true)
 h.edit('submitted');assert.equal(h.opts.store.tabs[0].isDirty,false);assert.equal(h.opts.store.tabs[0].textSignature,'A-2')
})
test('save analysis cannot submit old source to a replacement path/root',async()=>{const h=harness(),run=h.session.save();h.opts.file='C:/other/B.json';h.opts.store.libraryPath='C:/other';h.opts.epoch++;h.analysis.resolve({valid:true});await run;assert.equal(h.calls.length,0);assert.equal(h.pending(),0)})
test('save captures immutable source and keeps later input dirty without resetting editor',async()=>{const h=harness(),run=h.session.save();h.analysis.resolve({valid:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(h.calls.length,1);h.edit('{"value":"新增输入"}');h.write.resolve({content:'{"value":"保存的内容"}',signature:'A-2',encoding:'utf-8',size:50,modified:2});await run;assert.equal(h.text(),'{"value":"新增输入"}');assert.equal(h.opts.dirty.value,true);assert.equal(h.opts.signature.value,'A-2');assert.equal(h.pending(),0)})
test('pending native save protects window until it settles after unmount',async()=>{const h=harness(),run=h.session.save();h.analysis.resolve({valid:true});await new Promise(resolve=>setImmediate(resolve));h.dispose();assert.equal(h.pending(),1);h.write.resolve({content:'{"value":"保存的内容"}',signature:'A-2'});await run;assert.equal(h.pending(),0);assert.equal(h.opts.store.tabs[0].textSignature,'A-2')})

test('ordinary and Windows canonical UNC spellings wait for the same pending write',async()=>{const h=harness();h.opts.file='\\\\server\\share\\配置.json';h.session.bind();const run=h.session.save();let resolved=false;const waiting=h.session.waitForWrite({...h.session.capture(),path:'\\\\?\\UNC\\SERVER\\SHARE\\配置.json'}).then(()=>{resolved=true});await new Promise(resolve=>setImmediate(resolve));assert.equal(resolved,false);h.analysis.resolve({valid:true});await new Promise(resolve=>setImmediate(resolve));h.write.resolve({content:h.text(),signature:'A-2'});await run;await waiting;assert.equal(resolved,true)})

test('an unloaded replacement path cannot inherit the prior draft and signature',async()=>{const h=harness();h.edit('{"value":"未保存草稿"}');h.opts.file='C:/ui/B.json';h.opts.epoch++;const run=h.session.save();h.analysis.resolve({valid:true});h.write.resolve({content:h.text(),signature:'B-2'});await run;assert.equal(h.calls.length,0);assert.equal(h.opts.store.tabs[0].isDirty,true);assert.equal(h.opts.store.tabs[0].content,h.text());assert.equal(h.pending(),0);await h.session.reload();assert.equal(h.loads(),1)})
test('invalid-source confirmation cannot save newly entered content under an old decision',async()=>{const h=harness(),run=h.session.save();h.analysis.resolve({valid:false});await new Promise(resolve=>setImmediate(resolve));h.edit('{"value":"新内容"}');h.confirmation.resolve(true);await run;assert.equal(h.calls.length,0);assert.equal(h.pending(),0)})
test('reload confirmation belongs to captured file and source',async()=>{const h=harness(),run=h.session.reload();h.opts.file='C:/ui/B.json';h.confirmation.resolve(true);await run;assert.equal(h.loads(),0)})
test('late transformation and preview confirmation retain newer source',()=>{const h=harness(),owner=h.session.capture();h.edit('{"value":"新内容"}');h.session.offerChange(owner,'格式化','{}');assert.equal(h.session.preview.value,undefined);const current=h.session.capture();h.session.offerChange(current,'格式化','{}');h.edit('{"value":"又输入"}');h.session.applyChange();assert.equal(h.text(),'{"value":"又输入"}');assert.ok(h.session.previewError.value)})
test('native failure keeps dirty source and clears pending save protection',async()=>{const h=harness(),run=h.session.save();h.analysis.resolve({valid:true});await new Promise(resolve=>setImmediate(resolve));h.write.reject(Error('disk'));await run;assert.equal(h.opts.dirty.value,true);assert.equal(h.pending(),0);assert.match(h.errors[0],/当前修改仍保留/)})
test('JSON Pointer covers Unicode, escaped separators, quotes, empty keys and arrays',()=>{assert.equal(jsonPathToPointer('$["中文"]["a/b~c"][0]'),'/中文/a~1b~0c/0');assert.equal(jsonPathToPointer('$["a\\\"b"][""]'),'/a"b/');assert.equal(jsonPathToPointer('$'),'');assert.equal(jsonPathToPointer('$.items[12].name'),'/items/12/name');assert.equal(jsonPathToPointer('$[broken]'),undefined)})

test('CRLF receipt matches the editor line model and does not leave a false dirty state',async()=>{const h=harness();h.edit('{\n"value":"保存的内容"\n}');const run=h.session.save();h.analysis.resolve({valid:true});await new Promise(resolve=>setImmediate(resolve));h.write.resolve({content:'{\r\n"value":"保存的内容"\r\n}',signature:'A-2',encoding:'utf-8',size:30,modified:2});await run;assert.equal(h.opts.dirty.value,false)})

test('history restore is one isolated draft transaction and rejects stale editor, draft and read-only state',()=>{
 const h=harness();h.session.openHistory();const before=h.text();h.session.applyHistoryDraft('{"value":"历史"}',false,before);assert.equal(h.text(),'{"value":"历史"}');assert.equal(h.opts.store.tabs[0].content,h.text());assert.equal(h.opts.dirty.value,true)
 h.session.openHistory();const prior=h.text();h.edit('{"value":"后续输入"}');h.session.applyHistoryDraft('{}',false,prior);assert.equal(h.text(),'{"value":"后续输入"}')
 h.opts.readOnlyReason.value='locked';h.session.applyHistoryDraft('{}',false,h.text());assert.equal(h.text(),'{"value":"后续输入"}')
 h.opts.readOnlyReason.value='';h.opts.epoch++;h.session.applyHistoryDraft('{}',false,h.text());assert.equal(h.text(),'{"value":"后续输入"}')
})

test('history restoration focuses the current editor after the dialog closes, never a replacement editor',async()=>{
 const h=harness();h.session.openHistory(17);assert.equal(h.session.history.value.historyTimestamp,17)
 h.session.applyHistoryDraft('{}',false,h.text());assert.equal(h.focusCount(),0);await Promise.resolve();assert.equal(h.focusCount(),1)
 const replaced=harness();replaced.session.openHistory(19);replaced.session.applyHistoryDraft('{}',false,replaced.text());replaced.opts.epoch++
 await Promise.resolve();assert.equal(replaced.focusCount(),0)
})
test('structured save records original before write and saved snapshot after write, retaining later input',async()=>{
 const h=harness(),snap={content:'原稿',signature:'A-1'};h.opts.store.maxHistoryCount=10
 h.opts.mockInvoke=async command=>{if(command==='read_text_document')return snap;if(command==='save_history_version')return;if(command==='write_json_source_document')return h.write.promise;throw Error(command)}
 const before=h.text(),run=h.session.save();h.analysis.resolve({valid:true});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(h.calls.map(c=>c.command),['read_text_document','save_history_version','write_json_source_document']);assert.equal(h.calls[1].args.content,'原稿')
 h.edit('后续输入');h.write.resolve({content:before,signature:'A-2'});await run;assert.equal(h.calls.at(-1).command,'save_history_version');assert.equal(h.calls.at(-1).args.content,before);assert.equal(h.text(),'后续输入');assert.equal(h.opts.dirty.value,true)
})
test('failed original history protection prevents write; changed disk opens existing conflict',async()=>{
 for(const changed of [false,true]){const h=harness();h.opts.store.maxHistoryCount=10;h.opts.mockInvoke=async command=>{if(command==='read_text_document')return{content:'磁盘',signature:changed?'other':'A-1'};throw Error('history unavailable')};const run=h.session.save();h.analysis.resolve({valid:true});await run;assert.equal(h.calls.some(c=>c.command==='write_json_source_document'),false);assert.equal(h.opts.dirty.value,true);assert.equal(Boolean(h.session.conflict.value),changed)}
})
