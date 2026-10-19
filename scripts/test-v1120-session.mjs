import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {test} from 'node:test'
import ts from 'typescript'
import {jsonPathToPointer} from '../src/utils/structuredPaths.ts'
const box=value=>({value}),deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
function harness(){
 const analysis=deferred(),write=deferred(),confirmation=deferred(),calls=[],disposers=[],errors=[];let doc='{"value":"保存的内容"}',pending=0,loads=0
 const editor={state:{doc:{toString:()=>doc}},dispatch:change=>{doc=change.changes.insert}}
 const opts={path:()=>opts.file,external:()=>false,format:()=> 'json',generation:()=>opts.epoch,editor:()=>editor,file:'C:/ui/A.json',epoch:1,store:{libraryPath:'C:/ui',tabs:[],addTab(tab){if(!this.tabs.some(t=>t.path===tab.path))this.tabs.push(tab)}},loading:box(false),saving:box(false),dirty:box(true),signature:box('A-1'),encoding:box('utf-8'),fileSize:box(1),modified:box(1),readOnlyReason:box(''),dialog:{},message:{info(){},success(){},warning(){},error:e=>errors.push(e)},analyze:()=>analysis.promise,clearAnalysis(){},scheduleAnalysis(){},applySnapshot:async()=>{},load:async()=>{loads++}}
 const ctx=vm.createContext({exports:{},Promise,document:{body:{inert:false}},window:{addEventListener(){},removeEventListener(){}},Element:class{},require:name=>{
  if(name==='vue')return{shallowRef:box,onMounted(){},onBeforeUnmount:fn=>disposers.push(fn)}
  if(name.includes('tauriRuntime'))return{invoke:(command,args)=>{calls.push({command,args});return write.promise},listen:async()=>()=>{}}
  if(name.includes('appDialog'))return{confirmAppAction:()=>confirmation.promise}
  if(name.includes('windowDrafts'))return{beginWindowSave:()=>{pending++;return()=>pending--},recordWindowDraftActivity(){},useWindowDraft(){},useWindowDraftSnapshot(){}}
  if(name.includes('fileDisplayStyles')){const scope={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/fileDisplayStyles.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,scope);return scope.exports}
  throw Error(name)
 }})
 vm.runInContext(ts.transpileModule(fs.readFileSync('src/composables/useStructuredSession.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,ctx)
 const session=ctx.exports.useStructuredSession(opts);session.bind()
 return{session,opts,analysis,write,confirmation,calls,errors,edit:value=>{doc=value;session.sync(true)},text:()=>doc,pending:()=>pending,loads:()=>loads,dispose:()=>disposers.forEach(fn=>fn())}
}
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
