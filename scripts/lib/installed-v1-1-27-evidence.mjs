import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {collectionReuseFixture} from './collection-reuse-fixture.mjs'
export const collectionReuseChecks=['native-bundle-roundtrip-without-machine-identities','tag-menu-explicit-scope-and-cancel','saved-tag-rename-preserves-draft-history-and-prefix','import-preview-cancel-keeps-config','missing-conditions-can-remap-and-skip','cross-project-import-keeps-original-collections','files-and-other-unsaved-drafts-unchanged','trusted-input-and-no-runtime-errors']
export function validateInstalledCollectionReuse(report,manifest){
 assert.ok(['1.1.27','1.1.28', '1.1.29', '1.1.30', '1.1.31', '1.1.32', '1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion);assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/);assert.match(report.executableSha256,/^[a-f0-9]{64}$/)
 assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-trusted-input-native-conditions-and-file-bytes')
 for(const key of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','nativeFileDialogsAutomated','errorOverlay'])assert.equal(report[key],false)
 for(const key of ['failedReadKeptPreview','portableExact','cancelTagExact','tagExact','dirtyExact','historyExact','cancelImportExact','remapExact','originalCollectionsExact','documentsExact','otherDraftsPreserved'])assert.equal(report[key],true,key)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),collectionReuseChecks.map(id=>[id,'passed']));assert.equal(report.added.length,2);assert.equal(new Set(report.added.map(e=>e.name)).size,2)
 const ordinary=report.added.find(e=>e.filters),graph=report.added.find(e=>e.graphRoot);assert.ok(ordinary&&graph);assert.equal(ordinary.query,'预算');assert.deepEqual(ordinary.objectTypes,['markdown']);assert.equal(ordinary.filters.directory,'项目');assert.equal(ordinary.filters.tag,'工作');assert.equal(ordinary.filters.modifiedWithinDays,7);assert.equal(graph.graphRoot,'中心.md');assert.equal(graph.graphDepth,2);assert.equal(graph.query,'__longedit_graph_collection__')
 for(const type of ['pointerdown','click','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted));assert.ok(report.inputTrace.every(e=>e.trusted));assert.deepEqual(report.runtimeErrors,[]);assert.equal(report.outputs.length,5)
}
export function assertCollectionReuseOutputBytes(report,read){
 for(const item of report.outputs){const b=read(item.fileName);assert.equal(b.length,item.sizeBytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),item.sha256)}
 const bundle=JSON.parse(read('installed-v1127-conditions.json').toString('utf8'));assert.equal(bundle.kind,'longedit-collections');assert.equal(bundle.schemaVersion,1);assert.equal(bundle.collections.length,2);assert.ok(bundle.collections.every(e=>!('libraryPath'in e)&&!('id'in e)&&!('createdAt'in e)))
 const directory=bundle.collections[0].filters.directory;assert.match(directory,/^000-v1127-reuse-[a-f0-9-]+\/来源$/);assert.equal(bundle.collections[1].graphRoot,directory+'/一已保存.md')
 for(const item of report.added)assert.ok(item.libraryPath.replaceAll('\\','/').replace('//?/','').toLowerCase().endsWith('/'+directory.split('/')[0].toLowerCase()+'/目标项目'))
 for(const[key,name]of [['saved','installed-v1127-saved.md'],['dirty','installed-v1127-dirty.md'],['center','installed-v1127-center.md']])assert.equal(crypto.createHash('sha256').update(read(name)).digest('hex'),report.expectedBytes[key])
 for(const[name,key]of [['installed-v1127-saved.md','savedAfter'],['installed-v1127-dirty.md','dirty'],['installed-v1127-center.md','center']])assert.deepEqual(read(name),Buffer.from(collectionReuseFixture[key]))
 const input=JSON.parse(read('installed-v1127-input.json').toString('utf8'));assert.equal(input.collections.length,3);assert.deepEqual(input.collections[2].objectTypes,['unavailable-format'])
}
