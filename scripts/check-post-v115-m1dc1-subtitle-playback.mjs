import fs from 'node:fs'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const policy = readJson('shared/post-v115-m1dc1-subtitle-playback-policy.json')
const evidence = readJson('docs/evidence/post-v115-m1dc1-subtitle-playback/runtime-evidence.json')
const view = fs.readFileSync('src/views/MediaViewerView.vue', 'utf8')
const backend = fs.readFileSync('src-tauri/src/commands/media.rs', 'utf8')
const registry = fs.readFileSync('src-tauri/src/lib.rs', 'utf8')

const checks = {
  acceptedPolicy: policy.status === 'accepted'
    && policy.libraryOnly === true
    && policy.sameDirectoryAndStemOnly === true
    && policy.supportedExtensions.join(',') === 'vtt,srt'
    && policy.maximumSubtitleBytes === 2 * 1024 * 1024
    && policy.maximumCueCount === 10_000
    && policy.sourceFilesWritten === false
    && policy.selectedNextStage === 'M1-total-exit-criteria-audit'
    && policy.releaseCandidate === false,
  boundedBackend: backend.includes('discover_video_subtitles')
    && backend.includes('MAX_SUBTITLE_BYTES: u64 = 2 * 1024 * 1024')
    && backend.includes('MAX_SUBTITLE_CUES: usize = 10_000')
    && backend.includes('WorkspaceGuard::new(library_root)')
    && backend.includes('convert_srt_to_webvtt')
    && registry.includes('discover_video_subtitles'),
  playbackUi: view.includes('video-subtitle-select')
    && view.includes("video.addTextTrack('captions'")
    && view.includes('new VTTCue(')
    && view.includes("selectedSubtitleId.value = subtitleTracks.value[0]?.id || 'off'")
    && view.includes("runtime.track.mode = runtime.id === selectedSubtitleId.value ? 'showing' : 'disabled'"),
  realDifferenceClosed: evidence.stage === policy.stage
    && evidence.status === 'passed'
    && evidence.passed === true
    && evidence.baselineDifference.previousTextTrackCount === 0
    && evidence.baselineDifference.previousSubtitleControlVisible === false
    && evidence.baselineDifference.currentTextTrackCount === 2
    && evidence.baselineDifference.currentSubtitleControlVisible === true,
  timedTracks: evidence.actual.vttActive.selected === 'vtt'
    && evidence.actual.vttActive.activeTexts.includes('VTT first cue')
    && evidence.actual.srtActive.selected === 'srt'
    && evidence.actual.srtActive.activeTexts.includes('SRT second cue'),
  offAndReopen: evidence.actual.off.selected === 'off'
    && evidence.actual.off.modes.every(mode => mode === 'disabled')
    && evidence.actual.off.activeTexts.length === 0
    && evidence.actual.reopened.textTrackCount === 2
    && evidence.actual.reopened.cueCounts[0] === 2,
  failureAndSafety: evidence.actual.malformedRejected.rejected === true
    && evidence.actual.malformedRejected.message.includes('WEBVTT')
    && evidence.actual.sourceUnchanged === true
    && evidence.actual.runtimeErrorCount === 0
    && evidence.actual.vttActive.pageOverflow <= 0
    && evidence.actual.srtActive.pageOverflow <= 0
    && evidence.actual.narrow.pageOverflow <= 0,
  scopeBounded: policy.deferredScope.includes('external-window-sidecar-discovery')
    && policy.deferredScope.includes('embedded-subtitle-demux')
    && policy.deferredScope.includes('subtitle-source-editing')
    && policy.deferredScope.includes('video-transcoding')
    && policy.deferredScope.includes('structured-schema-provider-and-mapping'),
}

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
if (failures.length) throw new Error(`M1D-C1 subtitle playback gate failed: ${failures.join(', ')}`)
console.log('M1D-C1 accepted: real VTT/SRT active cues, selection, off state, reopen, malformed rejection and source safety are verified.')
