import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { reactive } from 'vue'
import { isTauriRuntime, listen } from './tauriRuntime'

export const LATEST_RELEASE_URL = 'https://github.com/Longyuyeee/Long_MarkDownReader/releases/latest'
const LAST_CHECK_KEY = 'longedit.update.last-successful-check'
const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

export type UpdateStatus =
  | 'idle'
  | 'ready'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'installing'
  | 'opening'
  | 'error'
  | 'unsupported'

export interface CommunityUpdateInfo {
  available: boolean
  currentVersion: string
  latestVersion: string
  releaseUrl: string
  releaseNotes: string
  publishedAt: string | null
  installerName: string
  installerSize: number
  installerSha256: string
}

export type UpdateProgressPhase = 'idle' | 'downloading' | 'verifying' | 'installing'

interface CommunityUpdateProgress {
  phase: Exclude<UpdateProgressPhase, 'idle'>
  downloadedBytes: number
  totalBytes: number
  percent: number
}

export const updaterState = reactive({
  status: 'idle' as UpdateStatus,
  currentVersion: '1.0.0',
  latestVersion: '',
  releaseUrl: LATEST_RELEASE_URL,
  releaseNotes: '',
  publishedAt: '' as string | null,
  installerName: '',
  installerSize: 0,
  installerSha256: '',
  progressPhase: 'idle' as UpdateProgressPhase,
  downloadedBytes: 0,
  totalBytes: 0,
  progressPercent: 0,
  error: '',
})

let initialization: Promise<void> | null = null
let activeCheck: Promise<CommunityUpdateInfo | null> | null = null
let progressListener: Promise<void> | null = null

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

const resetProgress = () => {
  updaterState.progressPhase = 'idle'
  updaterState.downloadedBytes = 0
  updaterState.totalBytes = updaterState.installerSize
  updaterState.progressPercent = 0
}

const initializeProgressListener = () => {
  if (progressListener) return progressListener
  progressListener = listen<CommunityUpdateProgress>('community-update-progress', event => {
    const progress = event.payload
    updaterState.progressPhase = progress.phase
    updaterState.downloadedBytes = Math.max(0, progress.downloadedBytes)
    updaterState.totalBytes = Math.max(0, progress.totalBytes)
    updaterState.progressPercent = Math.min(100, Math.max(0, progress.percent))
  }).then(() => undefined)
  return progressListener
}

export const initializeUpdater = async () => {
  if (initialization) return initialization
  initialization = (async () => {
    try {
      if (!isTauriRuntime()) {
        updaterState.status = 'unsupported'
        return
      }
      await initializeProgressListener()
      updaterState.currentVersion = await getVersion()
      updaterState.status = 'ready'
    } catch (error) {
      updaterState.error = errorMessage(error)
      updaterState.status = 'error'
    }
  })()
  return initialization
}

export const shouldRunAutomaticCheck = () => {
  const lastCheck = Number(localStorage.getItem(LAST_CHECK_KEY) || 0)
  return !Number.isFinite(lastCheck) || Date.now() - lastCheck >= AUTO_CHECK_INTERVAL_MS
}

export const checkForUpdates = async (manual = false): Promise<CommunityUpdateInfo | null> => {
  await initializeUpdater()
  if (!isTauriRuntime()) return null
  if (updaterState.status === 'installing') return null
  if (!manual && !shouldRunAutomaticCheck()) return null
  if (activeCheck) return activeCheck

  updaterState.status = 'checking'
  updaterState.error = ''
  activeCheck = invoke<CommunityUpdateInfo>('check_community_update')
    .then(info => {
      updaterState.currentVersion = info.currentVersion
      updaterState.latestVersion = info.latestVersion
      updaterState.releaseUrl = info.releaseUrl
      updaterState.releaseNotes = info.releaseNotes
      updaterState.publishedAt = info.publishedAt
      updaterState.installerName = info.installerName
      updaterState.installerSize = info.installerSize
      updaterState.installerSha256 = info.installerSha256
      resetProgress()
      updaterState.status = info.available ? 'available' : 'up-to-date'
      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()))
      return info
    })
    .catch(error => {
      updaterState.error = errorMessage(error)
      updaterState.status = 'error'
      return null
    })
    .finally(() => {
      activeCheck = null
    })
  return activeCheck
}

export const installAvailableUpdate = async () => {
  if (!updaterState.latestVersion || updaterState.status !== 'available') return false
  await initializeProgressListener()
  resetProgress()
  updaterState.status = 'installing'
  updaterState.error = ''
  try {
    await invoke('install_community_update', { expectedVersion: updaterState.latestVersion })
    return true
  } catch (error) {
    updaterState.error = errorMessage(error)
    updaterState.status = 'error'
    return false
  }
}

export const openLatestRelease = async () => {
  if (updaterState.status === 'installing') return false
  updaterState.status = 'opening'
  updaterState.error = ''
  try {
    const url = updaterState.releaseUrl || LATEST_RELEASE_URL
    if (isTauriRuntime()) await openUrl(url)
    else window.open(url, '_blank', 'noopener,noreferrer')
    updaterState.status = updaterState.latestVersion ? 'available' : 'ready'
    return true
  } catch (error) {
    updaterState.error = errorMessage(error)
    updaterState.status = 'error'
    return false
  }
}
