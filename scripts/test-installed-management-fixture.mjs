import assert from 'node:assert/strict'
import {test} from 'node:test'
import {managementMainTarget,assertPreparedManagementFixture,assertRestoredManagementFixture} from './lib/installed-management-fixture.mjs'
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
