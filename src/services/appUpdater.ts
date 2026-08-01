import { getVersion } from '@tauri-apps/api/app'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update, type DownloadEvent } from '@tauri-apps/plugin-updater'
import { reactive } from 'vue'
import { isTauriRuntime } from './tauriRuntime'

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'ready' | 'error' | 'unsupported'

export const updaterState = reactive({
  status: 'idle' as UpdateStatus,
  currentVersion: '1.0.0',
  availableVersion: '',
  releaseNotes: '',
  downloadedBytes: 0,
  contentLength: 0,
  error: '',
  lastCheckedAt: '',
})

let pendingUpdate: Update | null = null
let activeCheck: Promise<Update | null> | null = null

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export const initializeUpdater = async () => {
  if (!isTauriRuntime()) {
    updaterState.status = 'unsupported'
    return
  }
  updaterState.currentVersion = await getVersion()
}

export const checkForUpdates = async (): Promise<Update | null> => {
  if (!isTauriRuntime()) {
    updaterState.status = 'unsupported'
    return null
  }
  if (activeCheck) return activeCheck
  updaterState.status = 'checking'
  updaterState.error = ''
  activeCheck = check({ timeout: 15_000 })
  try {
    pendingUpdate = await activeCheck
    updaterState.lastCheckedAt = new Date().toISOString()
    if (!pendingUpdate) {
      updaterState.availableVersion = ''
      updaterState.releaseNotes = ''
      updaterState.status = 'current'
      return null
    }
    updaterState.availableVersion = pendingUpdate.version
    updaterState.releaseNotes = pendingUpdate.body || ''
    updaterState.status = 'available'
    return pendingUpdate
  } catch (error) {
    updaterState.error = errorMessage(error)
    updaterState.status = 'error'
    return null
  } finally {
    activeCheck = null
  }
}

export const installAvailableUpdate = async () => {
  if (!pendingUpdate || updaterState.status === 'downloading') return false
  updaterState.status = 'downloading'
  updaterState.downloadedBytes = 0
  updaterState.contentLength = 0
  updaterState.error = ''
  try {
    await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === 'Started') updaterState.contentLength = event.data.contentLength || 0
      if (event.event === 'Progress') updaterState.downloadedBytes += event.data.chunkLength
      if (event.event === 'Finished') updaterState.status = 'ready'
    }, { timeout: 120_000 })
    updaterState.status = 'ready'
    await relaunch()
    return true
  } catch (error) {
    updaterState.error = errorMessage(error)
    updaterState.status = 'error'
    return false
  }
}

export const updateProgress = () => updaterState.contentLength > 0
  ? Math.min(100, Math.round(updaterState.downloadedBytes / updaterState.contentLength * 100))
  : 0
