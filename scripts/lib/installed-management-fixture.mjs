import assert from 'node:assert/strict'
export function managementMainTarget(targets) {
 const target=targets.find(item=>item.type==='page'&&item.webSocketDebuggerUrl&&/^(?:https?:\/\/tauri\.localhost|tauri:\/\/localhost)(?:\/|$)/.test(item.url||'')&&!item.url.includes('external=1')&&!item.url.includes('quick-note'))
 assert.ok(target,'R5L requires the actual main application WebView, not an external or quick-note window');return target
}
export const managementCollections=entries=>JSON.parse(JSON.stringify(entries)).sort((a,b)=>a.id.localeCompare(b.id))
function assertRoot(config,library) {
 assert.equal(config.activeLibraryPath,library);assert.equal(config.libraries?.length,1);assert.equal(config.libraries[0].path,library)
 assert.ok(config.savedSearches.every(entry=>entry.libraryPath===library),'all collections must stay in the isolated library')
}
export function assertPreparedManagementFixture(config,library,version) {
 assertRoot(config,library)
 assert.equal(config.savedSearches.length,['1.1.10','1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16'].includes(version)?2:1,'retain the legacy marker plus the explicitly created current-version collection')
 const marker=config.savedSearches.find(entry=>entry.id==='r5l-saved-search');assert.ok(marker)
 assert.equal(marker.name,'R5L Restore Marker');assert.equal(marker.query,'R5L');assert.deepEqual([...marker.objectTypes].sort(),['json','plain-text'])
 if(['1.1.10','1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16'].includes(version)){
  const added=config.savedSearches.find(entry=>entry.name==='本版标签集合验收');assert.ok(added&&added.id!=='r5l-saved-search')
  assert.equal(added.query,'');assert.deepEqual(added.objectTypes,[]);assert.equal(added.filters?.tag,'验收一零')
  assert.match(added.filters.directory,/^v1110-tags-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
  assert.equal(added.filters.modifiedWithinDays,null);assert.deepEqual(added.filters.tags||[],[])
 }
 return managementCollections(config.savedSearches)
}
export function assertRestoredManagementFixture(config,library,expected) {
 assertRoot(config,library);assert.deepEqual(managementCollections(config.savedSearches),expected,'restore every collection identity, query, filter and ordering metadata without dropping the new collection')
}
