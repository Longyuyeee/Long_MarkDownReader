import assert from 'node:assert/strict'
import crypto from 'node:crypto'
export function managementMainTarget(targets) {
 const target=targets.find(item=>item.type==='page'&&item.webSocketDebuggerUrl&&/^(?:https?:\/\/tauri\.localhost|tauri:\/\/localhost)(?:\/|$)/.test(item.url||'')&&!item.url.includes('external=1')&&!item.url.includes('quick-note'))
 assert.ok(target,'R5L requires the actual main application WebView, not an external or quick-note window');return target
}
export const managementCollections=entries=>JSON.parse(JSON.stringify(entries)).sort((a,b)=>a.id.localeCompare(b.id))
function assertRoot(config,library,libraryPaths=[library]) {
 assert.equal(config.activeLibraryPath,library);assert.deepEqual(config.libraries?.map(entry=>entry.path),libraryPaths)
 assert.ok(config.savedSearches.every(entry=>libraryPaths.includes(entry.libraryPath)),'all collections must stay in the isolated library')
}
export function assertPreparedManagementFixture(config,library,version) {
 const crossProject=['1.1.27','1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37'].includes(version),target=crossProject?config.libraries?.[1]?.path:null
 if(crossProject){assert.equal(typeof target,'string');assert.ok(target.startsWith(library+'\\'));assert.match(target.slice(library.length+1).replaceAll('\\','/'),/^000-v1127-reuse-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/目标项目$/)}
 assertRoot(config,library,crossProject?[library,target]:[library])
 if(crossProject){
  assert.equal(config.savedSearches.length,4)
  const imported=config.savedSearches.filter(entry=>entry.libraryPath===target);assert.equal(imported.length,2)
  const ordinary=imported.find(entry=>entry.name==='二七复用'),graph=imported.find(entry=>entry.name==='二七复用（导入 1）');assert.ok(ordinary&&graph)
  assert.equal(ordinary.query,'预算');assert.deepEqual(ordinary.objectTypes,['markdown']);assert.equal(ordinary.filters?.directory,'项目');assert.equal(ordinary.filters?.tag,'工作');assert.equal(ordinary.filters?.modifiedWithinDays,7)
  assert.equal(graph.query,'__longedit_graph_collection__');assert.deepEqual(graph.objectTypes,[]);assert.equal(graph.graphRoot,'中心.md');assert.equal(graph.graphDepth,2)
  for(const entry of imported){assert.match(entry.id,/^collection-[a-f0-9-]+$/);assert.ok(entry.createdAt>1)}
 }
 else assert.equal(config.savedSearches.length,['1.1.10','1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37'].includes(version)?2:1,'retain the legacy marker plus the explicitly created current-version collection')
 const marker=config.savedSearches.find(entry=>entry.id==='r5l-saved-search');assert.ok(marker)
 assert.equal(marker.name,'R5L Restore Marker');assert.equal(marker.query,'R5L');assert.deepEqual([...marker.objectTypes].sort(),['json','plain-text'])
 if(['1.1.10','1.1.11', '1.1.12', '1.1.13', '1.1.14', '1.1.15', '1.1.16', '1.1.17', '1.1.18', '1.1.19', '1.1.20', '1.1.21', '1.1.22', '1.1.23', '1.1.24', '1.1.25', '1.1.26', '1.1.27', '1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37'].includes(version)){
  const added=config.savedSearches.find(entry=>entry.name==='本版标签集合验收');assert.ok(added&&added.id!=='r5l-saved-search')
  assert.equal(added.query,'');assert.deepEqual(added.objectTypes,[]);assert.equal(added.filters?.tag,'验收一零')
  assert.match(added.filters.directory,/^v1110-tags-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
  assert.equal(added.filters.modifiedWithinDays,null);assert.deepEqual(added.filters.tags||[],[])
 }
 return managementCollections(config.savedSearches)
}
export function assertRestoredManagementFixture(config,library,expected,libraryPaths=[library]) {
 assertRoot(config,library,libraryPaths);assert.deepEqual(managementCollections(config.savedSearches),expected,'restore every collection identity, query, filter and ordering metadata without dropping the new collection')
}

export function managementLibraryMappings(required,libraryPaths) {
 assert.equal(required?.length,libraryPaths.length)
 const fingerprints=new Map(libraryPaths.map(path=>[crypto.createHash('sha256').update(path).digest('hex'),path]))
 return required.map(item=>{const path=fingerprints.get(item.pathFingerprint);assert.ok(path,'backup mapping must match a known owned project');fingerprints.delete(item.pathFingerprint);return {pathFingerprint:item.pathFingerprint,path}})
}
