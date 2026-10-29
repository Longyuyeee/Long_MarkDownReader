import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {inflateRawSync} from 'node:zlib'
export const restoreContinuityChecks=['backup-with-real-reading-context','restored-files-exact-in-new-library','cancel-continuation-preserves-source','folder-mapping-covers-tabs-views-reference','clean-source-continues-mapped-files','mapped-reader-position-and-disk-reopen','dirty-source-retains-input-and-saves-only-scene','trusted-input-without-runtime-overlay']
const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
export function validateInstalledRestoreContinuity(report,manifest){
 assert.ok(['1.1.32','1.1.33', '1.1.34', '1.1.35', '1.1.36', '1.1.37', '1.2.0', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.2.8', '1.2.9', '1.2.10', '1.2.11', '1.2.12', '1.2.13', '1.2.14', '1.2.15', '1.2.16', '1.2.17', '1.2.18', '1.2.19', '1.2.20', '1.2.21', '1.2.22', '1.2.23', '1.2.24', '1.2.25', '1.2.26', '1.2.27', '1.2.28', '1.2.29', '1.2.30', '1.2.31', '1.2.32', '1.2.33', '1.2.34', '1.2.35', '1.2.36', '1.2.37', '1.2.38', '1.2.39', '1.2.40', '1.2.41', '1.2.42', '1.2.43', '1.2.44', '1.2.45', '1.3.0', '1.3.1', '1.3.2', '1.3.3', '1.3.4', '1.3.5', '1.3.6', '1.3.7', '1.3.8', '1.3.9', '1.3.10'].includes(manifest.appVersion));for(const k of ['appVersion','sourceCommit'])assert.equal(report[k],manifest[k]);assert.equal(report.installerSha256,manifest.artifacts.find(a=>a.target==='nsis')?.sha256)
 assert.equal(report.status,'passed');assert.equal(report.evidenceLevel,'installed-content-package-and-restored-work-session');assert.match(report.harnessSourceCommit,/^[a-f0-9]{40}$/);assert.match(report.executableSha256,/^[a-f0-9]{64}$/)
 for(const k of ['nativeBridgeMocked','desktopInputUsed','sourceUserContentIncluded','errorOverlay'])assert.equal(report[k],false)
 for(const k of ['exportSceneExact','restoreBytesExact','cancelledExact','mappingExact','continuedExact','saveReopenExact','deferredDirtyExact'])assert.equal(report[k],true,k)
 assert.equal(report.fixtureRegistrationsRemovedOnly,true);assert.deepEqual(report.finalLibraryPaths,report.originalLibraryPaths)
 assert.deepEqual(report.checks.map(c=>[c.id,c.status]),restoreContinuityChecks.map(id=>[id,'passed']));assert.deepEqual(report.runtimeErrors,[]);assert.ok(report.inputTrace.length>10&&report.inputTrace.every(e=>e.trusted));for(const t of ['click','pointerdown','keydown','input'])assert.ok(report.inputTrace.some(e=>e.type===t))
}
// Independently read the small owned ZIP's central directory and actual bytes.
// Bound every extraction; never trust a report's claimed member digest.
function archiveMember(bytes,name){
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break}assert.ok(end>=0)
 const count=bytes.readUInt16LE(end+10);let offset=bytes.readUInt32LE(end+16);assert.ok(count<=10001)
 for(let i=0;i<count;i++){assert.equal(bytes.readUInt32LE(offset),0x02014b50);const method=bytes.readUInt16LE(offset+10),size=bytes.readUInt32LE(offset+20),rawSize=bytes.readUInt32LE(offset+24),length=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32),at=bytes.readUInt32LE(offset+42),found=bytes.subarray(offset+46,offset+46+length).toString('utf8');offset+=46+length+extra+comment;if(found!==name)continue
  assert.ok(rawSize<=128*1024*1024);assert.equal(bytes.readUInt32LE(at),0x04034b50);const start=at+30+bytes.readUInt16LE(at+26)+bytes.readUInt16LE(at+28);assert.ok(start+size<=bytes.length);const compressed=bytes.subarray(start,start+size);assert.ok([0,8].includes(method));const result=method===0?compressed:inflateRawSync(compressed,{maxOutputLength:128*1024*1024});assert.equal(result.length,rawSize);return result
 }throw Error('ZIP member missing: '+name)
}
export function assertRestoreContinuityOutputBytes(report,read){
 const expected=['archive.zip','source.txt','restored.txt','observations.json'].map(n=>'installed-v1132-'+n);assert.deepEqual(report.outputs.map(o=>o.fileName).sort(),expected.sort())
 for(const o of report.outputs){const b=read(o.fileName);assert.equal(b.length,o.sizeBytes);assert.equal(sha(b),o.sha256)}
 const zip=read('installed-v1132-archive.zip'),manifest=JSON.parse(archiveMember(zip,'manifest.json')),observed=JSON.parse(read('installed-v1132-observations.json'))
 assert.deepEqual(manifest.workSession,report.packedSession);assert.ok(manifest.workSession.reference);assert.ok(manifest.workSession.files.some(f=>f.view?.scrollTop>100));assert.equal(manifest.kind,'longedit-library-content');assert.equal(manifest.schemaVersion,1)
 const source=read('installed-v1132-source.txt');assert.deepEqual(source,read('installed-v1132-restored.txt'));assert.deepEqual(source,archiveMember(zip,'files/'+report.sourceRelative));assert.equal(observed.restoredRoot,report.restoredRoot);assert.equal(observed.activeRoot.replace(/^\\\\\?\\/,'').replaceAll('\\','/').toLowerCase(),report.restoredRoot.replaceAll('\\','/').toLowerCase());assert.ok(observed.tabs.length>=40);assert.ok(observed.tabs.every(t=>t.path.replaceAll('\\','/').includes('/接续目录/')));assert.ok(observed.reference.path.replaceAll('\\','/').includes('/接续目录/'));assert.ok(Math.abs(observed.scrollTop-report.expectedScroll)<3);assert.equal(observed.dirtyContent,report.dirtyContent);assert.equal(observed.dirtyDiskSha256,sha(source));assert.ok(observed.dirtyRecord.tabs.length>=40)
}
