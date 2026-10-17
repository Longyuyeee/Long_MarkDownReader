import assert from 'node:assert/strict'
const normalizePath=value=>value.replace(/^\\\\\?\\/,'').replaceAll('/','\\').toLowerCase()
export const graphExplorationChecks = [
 'installed-identity-and-real-generated-graph', 'dense-search-and-nonoverlapping-active-label',
 'native-refresh-preserves-camera-and-selection', 'trusted-canvas-pan-retains-selection',
 'genuine-unavailable-library-retains-view', 'retry-reads-restored-native-library',
 'neighbor-refresh-and-return-camera', 'existing-layout-and-theme-tools-retained',
 'mindmap-refresh-continuity', 'initial-error-is-not-empty-and-can-retry',
 'single-select-and-double-click-managed-open', 'source-hashes-and-no-global-errors',
]
export function validateInstalledGraphExploration(report, manifest) {
 assert.ok(['1.1.11','1.1.12', '1.1.13'].includes(manifest.appVersion));assert.equal(report.appVersion,manifest.appVersion)
 assert.equal(report.sourceCommit,manifest.sourceCommit);assert.equal(report.installerSha256,manifest.artifacts.find(item=>item.target==='nsis')?.sha256)
 for(const key of ['sourceCommit','harnessSourceCommit'])assert.match(report[key],/^[a-f0-9]{40}$/)
 assert.match(report.executableSha256,/^[a-f0-9]{64}$/)
 assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-webview-input-native-graph-ipc-and-disk')
 assert.equal(report.nativeBridgeMocked,false);assert.equal(report.desktopInputUsed,false);assert.equal(report.sourceUserContentIncluded,false)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),graphExplorationChecks.map(id=>[id,'passed']))
 assert.equal(report.sourceFiles.length,180);assert.equal(new Set(report.sourceFiles.map(f=>f.path)).size,180)
 for(const f of report.sourceFiles){assert.match(f.before,/^[a-f0-9]{64}$/);assert.equal(f.before,f.after)}
 assert.equal(report.nativeGraph.ownedFiles,180);assert.ok(report.nativeGraph.nodes>=180);assert.ok(report.nativeGraph.edges>=180)
 assert.equal(report.selectedNodeId,report.nativeGraph.selectedNodeId)
 assert.ok(report.labels.some(l=>l.id===report.selectedNodeId&&l.text.length>10));assert.ok(report.labels.length<=36)
 for(const l of report.labels){for(const k of ['left','right','top','bottom'])assert.ok(Number.isFinite(l[k]));assert.ok(l.right>l.left&&l.bottom>l.top)}
 for(let i=0;i<report.labels.length;i++)for(let j=i+1;j<report.labels.length;j++){const a=report.labels[i],b=report.labels[j];assert.equal(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top,false)}
 for(const field of ['refresh','pan','failure','retry','neighbor','mindmap']){
  const item=report.poses[field];assert.ok(item&&item.before&&item.after)
  for(const key of ['x','y','zoom']){assert.ok(Number.isFinite(item.before[key])&&Number.isFinite(item.after[key]));assert.ok(Math.abs(item.before[key]-item.after[key])<.01,field+' camera discontinuity')}
 }
 assert.equal(report.failedGraphNodes,report.nativeGraph.nodes);assert.equal(report.retriedGraphNodes,report.nativeGraph.nodes)
 assert.equal(report.offlineRootRestored,true);assert.equal(report.initialErrorObserved,true);assert.equal(report.initialRetryObserved,true)
 assert.deepEqual(report.layouts,['自动网络','树状层级','组织结构','放射聚焦','时间线'])
 assert.deepEqual(report.themes,['专业 · 克制网格','多彩 · 语义光域','专注 · 纯净画布'])
 assert.equal(report.singleClickStayed,true);assert.equal(normalizePath(report.doubleClickPath),normalizePath(report.sourceFiles[17].path))
 assert.equal(report.documentContentVisible,true)
 for(const type of ['click','keydown','input','pointerdown','pointermove'])assert.ok(report.inputTrace.some(e=>e.type===type&&e.trusted))
 assert.ok(report.inputTrace.every(e=>e.trusted));assert.deepEqual(report.runtimeErrors,[]);assert.equal(report.errorOverlay,false)
}
