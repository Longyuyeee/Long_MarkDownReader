import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { webcrypto } from 'node:crypto'
import { test } from 'node:test'
const moduleAt=(file,deps={})=>{const exports={};vm.runInNewContext(ts.transpile(fs.readFileSync(file,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{exports,crypto:webcrypto,TextEncoder,require:name=>{if(!deps[name])throw Error(name);return deps[name]}});return exports}
const work=moduleAt('src/utils/workSessions.ts'),portable=moduleAt('src/utils/portableWorkSession.ts'),paths=moduleAt('src/utils/savedCollections.ts')
const service=moduleAt('src/services/workSessionTransfer.ts',{'../utils/workSessions':work,'../utils/portableWorkSession':portable,'../utils/savedCollections':paths})
const fixture=()=>({version:1,id:'one',name:'客户交付',libraryRoot:'C:/new',savedAt:1,tabs:[{id:'C:/new/a.md',path:'C:/new/a.md',title:'a',isDirty:false}],activeTabId:'C:/new/a.md'})
function store(){const entries=new Map();return {entries,getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value)}}
test('same portable file in the same vault is idempotent without renaming or overwriting unrelated records',async()=>{
 const s=store(),record=fixture(),fingerprint=await service.portableSessionFingerprint(portable.exportableWorkSession(record))
 const first=service.importWorkSessionRecord(s,record,fingerprint);assert.equal(first.duplicate,false)
 const before=s.getItem(work.workSessionKey(record.libraryRoot));const second=service.importWorkSessionRecord(s,{...record,id:'two',name:'another'},fingerprint)
 assert.equal(second.duplicate,true);assert.equal(second.entry.id,'one');assert.equal(s.getItem(work.workSessionKey(record.libraryRoot)),before)
 assert.throws(()=>service.importWorkSessionRecord(s,{...record,id:'three'},'a'.repeat(64)),/同名/)
})
test('import failure retains corrupt records and storage quota failure retains every original byte',()=>{
 const s=store(),record=fixture(),key=work.workSessionKey(record.libraryRoot);s.entries.set(key,'{broken')
 assert.throws(()=>service.importWorkSessionRecord(s,record,'b'.repeat(64)));assert.equal(s.getItem(key),'{broken')
 s.entries.set(key,'[]');assert.throws(()=>service.importWorkSessionRecord({...s,setItem:()=>{throw Error('quota')}},record,'b'.repeat(64)),/quota/);assert.equal(s.getItem(key),'[]')
})
test('repair is compare-and-swap metadata only, keeps origin identity and rejects stale dialogs',()=>{
 const s=store(),record=fixture();service.importWorkSessionRecord(s,record,'b'.repeat(64));const expected=work.readWorkSessions(s,record.libraryRoot)[0]
 const replacement={...expected,tabs:[{...expected.tabs[0],id:'C:/new/moved.md',path:'C:/new/moved.md'}],activeTabId:'C:/new/moved.md'}
 const updated=service.repairWorkSessionRecord(s,record.libraryRoot,expected,replacement);assert.equal(updated.importFingerprint,'b'.repeat(64));assert.equal(updated.tabs[0].path,'C:/new/moved.md')
 assert.throws(()=>service.repairWorkSessionRecord(s,record.libraryRoot,expected,replacement),/已变化/)
})
test('restore keeps exact text and specialized dirty models active and skips their incoming view',()=>{
 const dirty={id:'draft',path:'C:/new/a.md',isDirty:true,content:'PRIVATE'},specialized={id:'sheet',path:'C:/new/b.xlsx',isDirty:false,model:{private:'PRIVATE'}},scene=fixture()
 scene.tabs.push({id:'x',path:'\\\\?\\C:\\new\\b.xlsx',isDirty:false,title:'sheet'})
 const plan=service.planWorkSessionRestore([dirty,specialized],'sheet',scene,['C:/new/b.xlsx'])
 assert.equal(plan.tabs.length,2);assert.equal(plan.tabs[0],dirty);assert.equal(plan.tabs[1],specialized);assert.equal(plan.activeTabId,'sheet');assert.equal(plan.cleanPaths.length,0)
 assert.equal(dirty.content,'PRIVATE');assert.equal(specialized.model.private,'PRIVATE')
})
test('suggested names are unique and bounded even with full-width emoji names',()=>{
 const name='🙂'.repeat(60),suggested=service.availableSessionName(name,[{...fixture(),name}]);assert.ok([...suggested].length<=60);assert.notEqual(suggested,name)
})

test('invalid names and conflicting record identities cannot poison the existing scene list',()=>{
 const s=store(),record=fixture();service.importWorkSessionRecord(s,record,'b'.repeat(64))
 const key=work.workSessionKey(record.libraryRoot),before=s.getItem(key)
 for(const update of [{id:'two',name:''},{id:'two',name:' '.repeat(3)},{id:'two',name:'a'.repeat(61)},{id:'two',name:'bad\u0000name'},{id:'one',name:'another'},{id:'',name:'another'}]){
   assert.throws(()=>service.importWorkSessionRecord(s,{...record,...update},'c'.repeat(64)))
   assert.equal(s.getItem(key),before)
 }
})
