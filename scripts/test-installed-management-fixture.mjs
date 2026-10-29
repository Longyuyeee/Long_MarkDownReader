import assert from 'node:assert/strict'
import {test} from 'node:test'
import crypto from 'node:crypto'
import {managementMainTarget,assertPreparedManagementFixture,assertRestoredManagementFixture,managementLibraryMappings} from './lib/installed-management-fixture.mjs'
const library='C:\\LongEditR5ILibrary'
const marker={id:'r5l-saved-search',name:'R5L Restore Marker',query:'R5L',libraryPath:library,objectTypes:['plain-text','json'],filters:null,createdAt:1}
const added={id:'new-collection',name:'本版标签集合验收',query:'',libraryPath:library,objectTypes:[],filters:{directory:'v1110-tags-12345678-abcd-abcd-abcd-123456789012',tag:'验收一零',tags:[],modifiedWithinDays:null},createdAt:100}
const config=version=>({activeLibraryPath:library,libraries:[{path:library}],savedSearches:structuredClone(version==='1.1.10'?[marker,added]:[marker])})
test('legacy one-marker invariant remains strict; current version requires both actual collections',()=>{
 assert.equal(assertPreparedManagementFixture(config('1.1.9'),library,'1.1.9').length,1)
 assert.equal(assertPreparedManagementFixture(config('1.1.10'),library,'1.1.10').length,2)
 assert.throws(()=>assertPreparedManagementFixture(config('1.1.9'),library,'1.1.10'))
})
test('current preparation rejects missing markers, foreign roots, changed conditions and unrelated additions',()=>{
 for(const change of [c=>c.savedSearches.shift(),c=>c.activeLibraryPath='D:/foreign',c=>c.libraries.push({path:'D:/foreign'}),c=>c.savedSearches[0].query='changed',c=>c.savedSearches[1].libraryPath='D:/foreign',c=>c.savedSearches[1].filters.tag='new-tag',c=>c.savedSearches[1].filters.directory='../outside',c=>c.savedSearches.push({...marker,id:'extra'})]){const c=config('1.1.10');change(c);assert.throws(()=>assertPreparedManagementFixture(c,library,'1.1.10'))}
})
test('restore and reload preserve both complete metadata records, not merely an increased count',()=>{
 const c=config('1.1.10'),snapshot=assertPreparedManagementFixture(c,library,'1.1.10');c.savedSearches.reverse();assert.doesNotThrow(()=>assertRestoredManagementFixture(c,library,snapshot))
 for(const change of [c=>c.savedSearches.pop(),c=>c.savedSearches[1].filters.tag='changed',c=>c.savedSearches[1].id='regenerated',c=>c.savedSearches[1].createdAt++,c=>c.savedSearches[0].objectTypes=[]]){const changed=config('1.1.10');change(changed);assert.throws(()=>assertRestoredManagementFixture(changed,library,snapshot))}
})
test('management uses the real main Tauri target even when external/quick-note pages appear first',()=>{
 const target=url=>({type:'page',url,webSocketDebuggerUrl:'ws://owned'}),main=target('http://tauri.localhost/#/release-capabilities')
 assert.equal(managementMainTarget([target('http://tauri.localhost/#/temp?external=1'),target('http://tauri.localhost/?quick-note=1'),main]),main)
 assert.throws(()=>managementMainTarget([target('https://tauri.localhost.evil.invalid/'),target('http://tauri.localhost/#/temp?external=1')]))
})

const crossConfig=()=>{const c=config('1.1.10'),target=library+'\\000-v1127-reuse-12345678-abcd-abcd-abcd-123456789012\\目标项目';c.libraries.push({path:target});c.savedSearches.push({id:'collection-abcd-01',name:'二七复用',query:'预算',libraryPath:target,objectTypes:['markdown'],filters:{directory:'项目',tag:'工作',modifiedWithinDays:7},createdAt:200},{id:'collection-abcd-02',name:'二七复用（导入 1）',query:'__longedit_graph_collection__',libraryPath:target,objectTypes:[],graphRoot:'中心.md',graphDepth:2,createdAt:200});return c}
test('v1.1.27 management preserves both libraries and every imported condition exactly',()=>{
 const c=crossConfig(),paths=c.libraries.map(entry=>entry.path),snapshot=assertPreparedManagementFixture(c,library,'1.1.27');assert.equal(snapshot.length,4);assertRestoredManagementFixture(c,library,snapshot,paths)
 for(const mutate of [c=>c.savedSearches.pop(),c=>c.savedSearches[2].filters.directory='wrong',c=>c.savedSearches[3].graphRoot='wrong.md',c=>c.libraries.pop(),c=>c.libraries.push({path:'D:/foreign'}),c=>c.savedSearches[3].id='regenerated']){const changed=crossConfig();mutate(changed);assert.throws(()=>assertRestoredManagementFixture(changed,library,snapshot,paths))}
 assert.throws(()=>assertPreparedManagementFixture(config('1.1.10'),library,'1.1.27'))
})
test('management restore maps every fingerprint only to its matching owned project',()=>{
 const paths=crossConfig().libraries.map(entry=>entry.path),required=paths.map(path=>({pathFingerprint:crypto.createHash('sha256').update(path).digest('hex')}));assert.deepEqual(managementLibraryMappings([...required].reverse(),paths).map(item=>item.path),[...paths].reverse());assert.throws(()=>managementLibraryMappings(required.slice(1),paths));assert.throws(()=>managementLibraryMappings([required[0],required[0]],paths));assert.throws(()=>managementLibraryMappings([{pathFingerprint:'foreign'},required[1]],paths))
})
test('focused current management uses its real core fixture without requiring omitted tag or cross-project tasks',()=>{
 const c=config('1.1.9'),snapshot=assertPreparedManagementFixture(c,library,'1.3.10')
 assert.equal(snapshot.length,1);assertRestoredManagementFixture(c,library,snapshot)
 for(const changed of [config('1.1.10'),crossConfig(),{...c,activeLibraryPath:'D:/foreign'}])assert.throws(()=>assertPreparedManagementFixture(changed,library,'1.3.10'))
 const missing=config('1.1.9');missing.savedSearches=[];assert.throws(()=>assertPreparedManagementFixture(missing,library,'1.3.10'))
})
test('published full-regression baseline still requires all cross-project and tag collection records',()=>{
 assert.equal(assertPreparedManagementFixture(crossConfig(),library,'1.3.9').length,4)
 assert.throws(()=>assertPreparedManagementFixture(config('1.1.9'),library,'1.3.9'))
})
