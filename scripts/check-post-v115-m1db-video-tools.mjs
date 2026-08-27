import fs from 'node:fs'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = readJson('shared/post-v115-m1db-video-tools-policy.json')
const evidence = readJson('docs/evidence/post-v115-m1db-video-tools/runtime-evidence.json')
const view = fs.readFileSync('src/views/MediaViewerView.vue', 'utf8')
const backend = fs.readFileSync('src-tauri/src/commands/media.rs', 'utf8')
const commandRegistry = fs.readFileSync('src-tauri/src/lib.rs', 'utf8')

const videos = [evidence.actual.video1080, evidence.actual.video4k]
const expectedDimensions = [[1920, 1080], [3840, 2160]]
const checks = {
  acceptedPolicy: policy.status === 'accepted'
    && policy.sourceVideoWriteEnabled === false
    && policy.playbackPositionStoresPath === false
    && policy.screenshotMustMatchDecodedDimensions === true,
  workspaceControls: view.includes('video-frame-previous')
    && view.includes('video-frame-next')
    && view.includes('video-capture-frame')
    && view.includes('frameStepRate')
    && view.includes('crossorigin="anonymous"'),
  reliableBackend: backend.includes('save_video_frame_png')
    && backend.includes('source_identity_unchanged')
    && backend.includes('target_reopened')
    && commandRegistry.includes('save_video_frame_png'),
  evidencePassed: evidence.stage === policy.stage && evidence.status === 'passed' && evidence.passed === true,
  realDimensions: videos.every((video, index) => video.screenshot.width === expectedDimensions[index][0]
    && video.screenshot.height === expectedDimensions[index][1]
    && video.saveReport.status === 'saved_verified'),
  frameAccuracy: videos.every(video => Math.abs(video.nextDelta - 1 / 30) < 0.025
    && Math.abs(video.previousDelta - 1 / 30) < 0.025),
  positionAndPrivacy: videos.every(video => Math.abs(video.restoredTime - video.rememberedTime) < 0.12
    && video.storagePrivacy.count > 0
    && video.storagePrivacy.containsPath === false),
  safetyAndLayout: evidence.actual.sourceUnchanged === true
    && evidence.actual.runtimeErrorCount === 0
    && videos.every(video => video.overwriteRejected
      && video.saveReport.sourceIdentityUnchanged
      && video.saveReport.targetReopened
      && video.initial.pageOverflow <= 0
      && video.narrow.pageOverflow <= 0),
}

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
if (failures.length) throw new Error(`M1D-B video tools gate failed: ${failures.join(', ')}`)
console.log('M1D-B video tools accepted: real 1080p/4K frame stepping, PNG capture, position restore and source safety are verified.')
