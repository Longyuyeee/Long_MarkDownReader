import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { assertV121DevelopmentBoundary, assertV121UpdaterStatus } from './lib/v121-updater-status.mjs'

test('graph candidate retains the exact public 1.1.10 predecessor without borrowing old updater success',()=>{
 const development={runtimeBaseVersion:'1.1.11',publicVersion:'1.1.10',publicTag:'v1.1.10',publicTagCommit:'599374bf4f11454889e11a6f0f9a7ac6e2cabb0e',developmentTargetVersion:'1.1.11'}
 const community={appVersion:'1.1.11',targetRelease:{tag:'v1.1.11'},gates:{githubReleasePublished:false},release:null,patchValidation:{previousPublicVersion:'1.1.10',managedUpdaterUpgradePath:'1.1.10-to-1.1.11-pending'}}
 assert.doesNotThrow(()=>assertV121DevelopmentBoundary(development,community))
 assert.throws(()=>assertV121DevelopmentBoundary({...development,publicTagCommit:'a'.repeat(40)},community))
 assert.throws(()=>assertV121DevelopmentBoundary({...development,developmentTargetVersion:'1.1.12'},community))
 assert.doesNotThrow(()=>assertV121UpdaterStatus({status:'hosted-managed-update-passed'},community,{managedUpdaterObservation:'1.0.20-to-1.0.21-passed'}))
 assert.throws(()=>assertV121UpdaterStatus({status:'hosted-managed-update-passed'},{...community,patchValidation:{...community.patchValidation,managedUpdaterUpgradePath:'1.0.20-to-1.0.21-passed'}},{managedUpdaterObservation:'1.0.20-to-1.0.21-passed'}))
 const published={...community,gates:{githubReleasePublished:true},release:{taggedCommit:'b'.repeat(40)}}
 assert.doesNotThrow(()=>assertV121DevelopmentBoundary({...development,publicVersion:'1.1.11',publicTag:'v1.1.11',publicTagCommit:'b'.repeat(40),developmentTargetVersion:'1.1.12'},published))
})

test('published v1.0.24 requires its exact tag and keeps the new updater pending', () => {
  const development = { publicVersion: '1.0.24', publicTag: 'v1.0.24', publicTagCommit: '9fa7ffa0f778773cfd999169e695e32a705168ae', runtimeBaseVersion: '1.0.24', developmentTargetVersion: '1.0.25' }
  const community = { appVersion: '1.0.24', gates: { githubReleasePublished: true }, release: { tag: 'v1.0.24', taggedCommit: development.publicTagCommit }, targetRelease: { tag: 'v1.0.24' }, patchValidation: { previousPublicVersion: '1.0.23', managedUpdaterUpgradePath: '1.0.23-to-1.0.24-pending' } }
  assertV121DevelopmentBoundary(development, community)
  assert.equal(development.publicVersion, '1.0.24')
  assert.throws(() => assertV121DevelopmentBoundary({ ...development, publicTagCommit: '0'.repeat(40) }, community))
  assert.throws(() => assertV121DevelopmentBoundary({ ...development, developmentTargetVersion: '1.0.26' }, community))
  const policy = { status: 'hosted-managed-update-passed' }
  const receipt = { managedUpdaterObservation: '1.0.20-to-1.0.21-passed' }
  assertV121UpdaterStatus(policy, community, receipt)
  assert.throws(() => assertV121UpdaterStatus(policy, { ...community, release: { ...community.release, taggedCommit: '0'.repeat(40) } }, receipt))
  assert.throws(() => assertV121UpdaterStatus(policy, { ...community, patchValidation: { ...community.patchValidation, managedUpdaterUpgradePath: '1.0.23-to-1.0.24-passed' } }, receipt))
})

for (const status of ['hosted-execution-pending', 'hosted-managed-update-passed']) {
  for (const communitySuffix of ['pending', 'passed']) {
    for (const receiptSuffix of ['pending', 'passed']) {
      test(`${status}: community=${communitySuffix}, receipt=${receiptSuffix}`, () => {
        const check = () => assertV121UpdaterStatus({ status }, {
          appVersion: '1.0.21',
          patchValidation: { managedUpdaterUpgradePath: `1.0.20-to-1.0.21-${communitySuffix}` },
        }, { managedUpdaterObservation: `1.0.20-to-1.0.21-${receiptSuffix}` })
        const expected = status === 'hosted-execution-pending' ? 'pending' : 'passed'
        if (communitySuffix === expected && receiptSuffix === expected) assert.doesNotThrow(check)
        else assert.throws(check, /status conflict/)
      })
    }
  }
}
test('unknown status fails closed', () => {
  assert.throws(() => assertV121UpdaterStatus({ status: 'unknown' }, {}, {}), /Unknown/)
})

const successor = () => ({ appVersion: '1.0.22', targetRelease: { tag: 'v1.0.22' }, patchValidation: { previousPublicVersion: '1.0.21', managedUpdaterUpgradePath: '1.0.21-to-1.0.22-pending' } })

test('v1.0.23 candidate does not inherit historical updater acceptance', () => {
  const development = { publicVersion: '1.0.22', publicTag: 'v1.0.22', publicTagCommit: 'cc58aa68d1974ac2445ed4b884c7677f5a320e93', runtimeBaseVersion: '1.0.23', developmentTargetVersion: '1.0.23' }
  const community = { appVersion: '1.0.23', targetRelease: { tag: 'v1.0.23' }, gates: { githubReleasePublished: false }, patchValidation: { previousPublicVersion: '1.0.22', managedUpdaterUpgradePath: '1.0.22-to-1.0.23-pending' } }
  assert.doesNotThrow(() => assertV121DevelopmentBoundary(development, community))
  assert.doesNotThrow(() => assertV121UpdaterStatus({ status: 'hosted-managed-update-passed' }, community, { managedUpdaterObservation: '1.0.20-to-1.0.21-passed' }))
  assert.throws(() => assertV121DevelopmentBoundary({ ...development, publicTagCommit: '0'.repeat(40) }, community))
  assert.throws(() => assertV121UpdaterStatus({ status: 'hosted-managed-update-passed' }, { ...community, patchValidation: { ...community.patchValidation, managedUpdaterUpgradePath: '1.0.22-to-1.0.23-passed' } }, { managedUpdaterObservation: '1.0.20-to-1.0.21-passed' }))
})
const closed = { status: 'hosted-managed-update-passed' }
test('published successor boundary requires its own real release identity', () => {
  const development = { publicVersion: '1.0.22', publicTag: 'v1.0.22', publicTagCommit: 'a'.repeat(40), runtimeBaseVersion: '1.0.22', developmentTargetVersion: '1.0.23' }
  const community = { ...successor(), gates: { githubReleasePublished: true }, release: { tag: 'v1.0.22', taggedCommit: 'a'.repeat(40) } }
  assert.doesNotThrow(() => assertV121DevelopmentBoundary(development, community))
  assert.throws(() => assertV121DevelopmentBoundary(development, { ...community, gates: { githubReleasePublished: false } }))
  assert.throws(() => assertV121DevelopmentBoundary({ ...development, publicTagCommit: 'b'.repeat(40) }, community))
})
const receipt = { managedUpdaterObservation: '1.0.20-to-1.0.21-passed' }
test('v1.1.18 keeps its exact predecessor and a separate update observation in candidate and public states', () => {
  const development = { publicVersion:'1.1.17',publicTag:'v1.1.17',publicTagCommit:'bcbb9265f66faae396fd5f43cb3354562c89fcab',runtimeBaseVersion:'1.1.18',developmentTargetVersion:'1.1.18',releaseCandidate:false }
  const community = { appVersion:'1.1.18',targetRelease:{tag:'v1.1.18'},gates:{githubReleasePublished:false},release:null,patchValidation:{previousPublicVersion:'1.1.17',managedUpdaterUpgradePath:'1.1.17-to-1.1.18-pending'} }
  const before = JSON.stringify([development,community,closed,receipt])
  assert.doesNotThrow(()=>assertV121DevelopmentBoundary(development,community));assert.doesNotThrow(()=>assertV121UpdaterStatus(closed,community,receipt))
  assert.equal(JSON.stringify([development,community,closed,receipt]),before)
  for(const change of [{publicTagCommit:'0'.repeat(40)},{publicTagCommit:'a'.repeat(40)},{developmentTargetVersion:'1.1.19'},{runtimeBaseVersion:'1.1.17'},{releaseCandidate:true}])assert.throws(()=>assertV121DevelopmentBoundary({...development,...change},community))
  const publicDevelopment={...development,publicVersion:'1.1.18',publicTag:'v1.1.18',publicTagCommit:'a'.repeat(40),developmentTargetVersion:'1.1.19'},publicCommunity={...community,gates:{githubReleasePublished:true},release:{tag:'v1.1.18',taggedCommit:'a'.repeat(40)}}
  assert.doesNotThrow(()=>assertV121DevelopmentBoundary(publicDevelopment,publicCommunity));assert.throws(()=>assertV121DevelopmentBoundary(publicDevelopment,{...publicCommunity,release:{...publicCommunity.release,taggedCommit:'b'.repeat(40)}}))
  for(const change of [{previousPublicVersion:'1.1.16'},{managedUpdaterUpgradePath:'1.0.20-to-1.0.21-passed'}])assert.throws(()=>assertV121UpdaterStatus(closed,{...community,patchValidation:{...community.patchValidation,...change}},receipt))
  assert.throws(()=>assertV121UpdaterStatus(closed,community,{managedUpdaterObservation:'1.0.20-to-1.0.21-pending'}))
})
test('successor keeps the historical receipt and a separate pending update path', () => {
  const community = successor()
  const before = JSON.stringify([closed, community, receipt])
  assert.doesNotThrow(() => assertV121UpdaterStatus(closed, community, receipt))
  assert.equal(JSON.stringify([closed, community, receipt]), before)
})
for (const scenario of ['pending-predecessor', 'stale-successor-path', 'wrong-previous', 'wrong-tag', 'unknown-version', 'changed-receipt']) {
  test(`successor rejects ${scenario}`, () => {
    const community = successor()
    const policy = { ...closed }
    const historical = { ...receipt }
    if (scenario === 'pending-predecessor') { policy.status = 'hosted-execution-pending'; historical.managedUpdaterObservation = '1.0.20-to-1.0.21-pending' }
    if (scenario === 'stale-successor-path') community.patchValidation.managedUpdaterUpgradePath = receipt.managedUpdaterObservation
    if (scenario === 'wrong-previous') community.patchValidation.previousPublicVersion = '1.0.20'
    if (scenario === 'wrong-tag') community.targetRelease.tag = 'v1.0.21'
    if (scenario === 'unknown-version') community.appVersion = '1.0.23'
    if (scenario === 'changed-receipt') historical.managedUpdaterObservation = '1.0.21-to-1.0.22-passed'
    assert.throws(() => assertV121UpdaterStatus(policy, community, historical), /status conflict/)
  })
}
test('version boundary admits only current and planned successor runtime', () => {
  const development = { publicVersion: '1.0.21', developmentTargetVersion: '1.0.22', runtimeBaseVersion: '1.0.21' }
  assert.doesNotThrow(() => assertV121DevelopmentBoundary(development, { appVersion: '1.0.21' }))
  assert.doesNotThrow(() => assertV121DevelopmentBoundary({ ...development, runtimeBaseVersion: '1.0.22' }, successor()))
  for (const change of [{ publicVersion: '1.0.22' }, { developmentTargetVersion: '1.0.23' }, { runtimeBaseVersion: '1.0.23' }, { runtimeBaseVersion: '1.0.22' }]) {
    assert.throws(() => assertV121DevelopmentBoundary({ ...development, ...change }, { appVersion: '1.0.21' }), /boundary drift/)
  }
})

test('v1.1.19 keeps its exact predecessor and a separate update observation in candidate and public states', () => {
  const development = { publicVersion:'1.1.18',publicTag:'v1.1.18',publicTagCommit:'9b621511807e4233147a5a6d4265a2be97f53b0f',runtimeBaseVersion:'1.1.19',developmentTargetVersion:'1.1.19',releaseCandidate:false }
  const community = { appVersion:'1.1.19',targetRelease:{tag:'v1.1.19'},gates:{githubReleasePublished:false},release:null,patchValidation:{previousPublicVersion:'1.1.18',managedUpdaterUpgradePath:'1.1.18-to-1.1.19-pending'} }
  const before = JSON.stringify([development,community,closed,receipt])
  assert.doesNotThrow(()=>assertV121DevelopmentBoundary(development,community));assert.doesNotThrow(()=>assertV121UpdaterStatus(closed,community,receipt))
  assert.equal(JSON.stringify([development,community,closed,receipt]),before)
  for(const change of [{publicTagCommit:'0'.repeat(40)},{publicTagCommit:'a'.repeat(40)},{developmentTargetVersion:'1.1.20'},{runtimeBaseVersion:'1.1.18'},{releaseCandidate:true}])assert.throws(()=>assertV121DevelopmentBoundary({...development,...change},community))
  const publicDevelopment={...development,publicVersion:'1.1.19',publicTag:'v1.1.19',publicTagCommit:'a'.repeat(40),developmentTargetVersion:'1.1.20'},publicCommunity={...community,gates:{githubReleasePublished:true},release:{tag:'v1.1.19',taggedCommit:'a'.repeat(40)}}
  assert.doesNotThrow(()=>assertV121DevelopmentBoundary(publicDevelopment,publicCommunity));assert.throws(()=>assertV121DevelopmentBoundary(publicDevelopment,{...publicCommunity,release:{...publicCommunity.release,taggedCommit:'b'.repeat(40)}}))
  for(const change of [{previousPublicVersion:'1.1.17'},{managedUpdaterUpgradePath:'1.0.20-to-1.0.21-passed'}])assert.throws(()=>assertV121UpdaterStatus(closed,{...community,patchValidation:{...community.patchValidation,...change}},receipt))
  assert.throws(()=>assertV121UpdaterStatus(closed,community,{managedUpdaterObservation:'1.0.20-to-1.0.21-pending'}))
})

test('v1.1.28 keeps predecessor identity and independent updater observation', () => {
 const community={appVersion:'1.1.28',targetRelease:{tag:'v1.1.28'},gates:{githubReleasePublished:false},release:null,patchValidation:{previousPublicVersion:'1.1.27',managedUpdaterUpgradePath:'1.1.27-to-1.1.28-pending'}}
 const development={runtimeBaseVersion:'1.1.28',publicVersion:'1.1.27',publicTag:'v1.1.27',publicTagCommit:'9def6c7a7e8b96be61fd48d41f925085eb8036f1',developmentTargetVersion:'1.1.28',releaseCandidate:false}
 assert.doesNotThrow(()=>assertV121DevelopmentBoundary(development,community));assert.doesNotThrow(()=>assertV121UpdaterStatus(closed,community,receipt))
 assert.throws(()=>assertV121UpdaterStatus(closed,{...community,patchValidation:{...community.patchValidation,managedUpdaterUpgradePath:'1.0.20-to-1.0.21-passed'}},receipt))
 assert.throws(()=>assertV121DevelopmentBoundary({...development,publicTagCommit:'a'.repeat(40)},community))
 const published={...community,gates:{githubReleasePublished:true},release:{tag:'v1.1.28',taggedCommit:'b'.repeat(40)}}
 assert.doesNotThrow(()=>assertV121DevelopmentBoundary({...development,publicVersion:'1.1.28',publicTag:'v1.1.28',publicTagCommit:'b'.repeat(40),developmentTargetVersion:'1.1.29'},published))
})

test('v1.1.29 keeps predecessor identity and independent updater observation', () => {
 const community={appVersion:'1.1.29',targetRelease:{tag:'v1.1.29'},gates:{githubReleasePublished:false},release:null,patchValidation:{previousPublicVersion:'1.1.28',managedUpdaterUpgradePath:'1.1.28-to-1.1.29-pending'}}
 const development={runtimeBaseVersion:'1.1.29',publicVersion:'1.1.28',publicTag:'v1.1.28',publicTagCommit:'eba705bce78744fa20d30a7acad422d7297f0ef1',developmentTargetVersion:'1.1.29',releaseCandidate:false}
 assert.doesNotThrow(()=>assertV121DevelopmentBoundary(development,community));assert.doesNotThrow(()=>assertV121UpdaterStatus(closed,community,receipt))
 assert.throws(()=>assertV121UpdaterStatus(closed,{...community,patchValidation:{...community.patchValidation,managedUpdaterUpgradePath:'1.0.20-to-1.0.21-passed'}},receipt))
 assert.throws(()=>assertV121DevelopmentBoundary({...development,publicTagCommit:'a'.repeat(40)},community))
 const published={...community,gates:{githubReleasePublished:true},release:{tag:'v1.1.29',taggedCommit:'b'.repeat(40)}}
 assert.doesNotThrow(()=>assertV121DevelopmentBoundary({...development,publicVersion:'1.1.29',publicTag:'v1.1.29',publicTagCommit:'b'.repeat(40),developmentTargetVersion:'1.1.30'},published))
})

test('v1.1.30 keeps predecessor identity and independent updater observation', () => {
 const community={appVersion:'1.1.30',targetRelease:{tag:'v1.1.30'},gates:{githubReleasePublished:false},release:null,patchValidation:{previousPublicVersion:'1.1.29',managedUpdaterUpgradePath:'1.1.29-to-1.1.30-pending'}}
 const development={runtimeBaseVersion:'1.1.30',publicVersion:'1.1.29',publicTag:'v1.1.29',publicTagCommit:'c177bbe9952684b61fcf0f253f77d88a6cfbcb9a',developmentTargetVersion:'1.1.30',releaseCandidate:false}
 assert.doesNotThrow(()=>assertV121DevelopmentBoundary(development,community));assert.doesNotThrow(()=>assertV121UpdaterStatus(closed,community,receipt))
 assert.throws(()=>assertV121UpdaterStatus(closed,{...community,patchValidation:{...community.patchValidation,managedUpdaterUpgradePath:'1.0.20-to-1.0.21-passed'}},receipt))
 assert.throws(()=>assertV121DevelopmentBoundary({...development,publicTagCommit:'a'.repeat(40)},community))
 const published={...community,gates:{githubReleasePublished:true},release:{tag:'v1.1.30',taggedCommit:'b'.repeat(40)}}
 assert.doesNotThrow(()=>assertV121DevelopmentBoundary({...development,publicVersion:'1.1.30',publicTag:'v1.1.30',publicTagCommit:'b'.repeat(40),developmentTargetVersion:'1.1.31'},published))
})

test('v1.1.34 retains its real v1.1.33 predecessor and a separate managed-update observation',()=>{
 const development={runtimeBaseVersion:'1.1.34',publicVersion:'1.1.33',publicTag:'v1.1.33',publicTagCommit:'9961c0c2fe9f02ced2ae9987bb6b55cd26d739cf',developmentTargetVersion:'1.1.34',releaseCandidate:false},community={appVersion:'1.1.34',targetRelease:{tag:'v1.1.34'},gates:{githubReleasePublished:false},release:null,patchValidation:{previousPublicVersion:'1.1.33',managedUpdaterUpgradePath:'1.1.33-to-1.1.34-pending'}}
 assert.doesNotThrow(()=>assertV121DevelopmentBoundary(development,community));assert.throws(()=>assertV121DevelopmentBoundary({...development,publicTagCommit:'a'.repeat(40)},community))
 assert.doesNotThrow(()=>assertV121UpdaterStatus({status:'hosted-managed-update-passed'},community,{managedUpdaterObservation:'1.0.20-to-1.0.21-passed'}));assert.throws(()=>assertV121UpdaterStatus({status:'hosted-managed-update-passed'},{...community,patchValidation:{...community.patchValidation,managedUpdaterUpgradePath:'1.0.20-to-1.0.21-passed'}},{managedUpdaterObservation:'1.0.20-to-1.0.21-passed'}))
 const published={...community,gates:{githubReleasePublished:true},release:{tag:'v1.1.34',taggedCommit:'b'.repeat(40)}};assert.doesNotThrow(()=>assertV121DevelopmentBoundary({...development,publicVersion:'1.1.34',publicTag:'v1.1.34',publicTagCommit:'b'.repeat(40),developmentTargetVersion:'1.1.35'},published))
})

test('v1.1.35 retains its real v1.1.34 predecessor and a separate managed-update observation',()=>{
 const development={runtimeBaseVersion:'1.1.35',publicVersion:'1.1.34',publicTag:'v1.1.34',publicTagCommit:'af69cdb4fd84b43f63248a1bc8da9ff2815df116',developmentTargetVersion:'1.1.35',releaseCandidate:false},community={appVersion:'1.1.35',targetRelease:{tag:'v1.1.35'},gates:{githubReleasePublished:false},release:null,patchValidation:{previousPublicVersion:'1.1.34',managedUpdaterUpgradePath:'1.1.34-to-1.1.35-pending'}}
 assert.doesNotThrow(()=>assertV121DevelopmentBoundary(development,community));assert.throws(()=>assertV121DevelopmentBoundary({...development,publicTagCommit:'a'.repeat(40)},community))
 assert.doesNotThrow(()=>assertV121UpdaterStatus({status:'hosted-managed-update-passed'},community,{managedUpdaterObservation:'1.0.20-to-1.0.21-passed'}));assert.throws(()=>assertV121UpdaterStatus({status:'hosted-managed-update-passed'},{...community,patchValidation:{...community.patchValidation,managedUpdaterUpgradePath:'1.0.20-to-1.0.21-passed'}},{managedUpdaterObservation:'1.0.20-to-1.0.21-passed'}))
 const published={...community,gates:{githubReleasePublished:true},release:{tag:'v1.1.35',taggedCommit:'b'.repeat(40)}};assert.doesNotThrow(()=>assertV121DevelopmentBoundary({...development,publicVersion:'1.1.35',publicTag:'v1.1.35',publicTagCommit:'b'.repeat(40),developmentTargetVersion:'1.1.36'},published))
})

test('v1.1.36 retains its real v1.1.35 predecessor and a separate managed-update observation',()=>{
 const development={runtimeBaseVersion:'1.1.36',publicVersion:'1.1.35',publicTag:'v1.1.35',publicTagCommit:'4857485ac31d598ae2077cf6c018e9983ffedd25',developmentTargetVersion:'1.1.36',releaseCandidate:false},community={appVersion:'1.1.36',targetRelease:{tag:'v1.1.36'},gates:{githubReleasePublished:false},release:null,patchValidation:{previousPublicVersion:'1.1.35',managedUpdaterUpgradePath:'1.1.35-to-1.1.36-pending'}}
 assert.doesNotThrow(()=>assertV121DevelopmentBoundary(development,community));assert.throws(()=>assertV121DevelopmentBoundary({...development,publicTagCommit:'a'.repeat(40)},community))
 assert.doesNotThrow(()=>assertV121UpdaterStatus({status:'hosted-managed-update-passed'},community,{managedUpdaterObservation:'1.0.20-to-1.0.21-passed'}));assert.throws(()=>assertV121UpdaterStatus({status:'hosted-managed-update-passed'},{...community,patchValidation:{...community.patchValidation,managedUpdaterUpgradePath:'1.0.20-to-1.0.21-passed'}},{managedUpdaterObservation:'1.0.20-to-1.0.21-passed'}))
 const published={...community,gates:{githubReleasePublished:true},release:{tag:'v1.1.36',taggedCommit:'b'.repeat(40)}};assert.doesNotThrow(()=>assertV121DevelopmentBoundary({...development,publicVersion:'1.1.36',publicTag:'v1.1.36',publicTagCommit:'b'.repeat(40),developmentTargetVersion:'1.1.37'},published))
})

test('v1.1.37 retains its real v1.1.36 predecessor and a separate managed-update observation',()=>{
 const development={runtimeBaseVersion:'1.1.37',publicVersion:'1.1.36',publicTag:'v1.1.36',publicTagCommit:'d4f62a11d61b49ff551d75aeab9a7dff2c2dc9a9',developmentTargetVersion:'1.1.37',releaseCandidate:false},community={appVersion:'1.1.37',targetRelease:{tag:'v1.1.37'},gates:{githubReleasePublished:false},release:null,patchValidation:{previousPublicVersion:'1.1.36',managedUpdaterUpgradePath:'1.1.36-to-1.1.37-pending'}}
 assert.doesNotThrow(()=>assertV121DevelopmentBoundary(development,community));assert.throws(()=>assertV121DevelopmentBoundary({...development,publicTagCommit:'a'.repeat(40)},community))
 assert.doesNotThrow(()=>assertV121UpdaterStatus({status:'hosted-managed-update-passed'},community,{managedUpdaterObservation:'1.0.20-to-1.0.21-passed'}));assert.throws(()=>assertV121UpdaterStatus({status:'hosted-managed-update-passed'},{...community,patchValidation:{...community.patchValidation,managedUpdaterUpgradePath:'1.0.20-to-1.0.21-passed'}},{managedUpdaterObservation:'1.0.20-to-1.0.21-passed'}))
 const published={...community,gates:{githubReleasePublished:true},release:{tag:'v1.1.37',taggedCommit:'b'.repeat(40)}};assert.doesNotThrow(()=>assertV121DevelopmentBoundary({...development,publicVersion:'1.1.37',publicTag:'v1.1.37',publicTagCommit:'b'.repeat(40),developmentTargetVersion:'1.1.38'},published))
})
