import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { reactive } from 'vue'
import { isTauriRuntime } from './tauriRuntime'

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
  error: '',
})

let initialization: Promise<void> | null = null
let activeCheck: Promise<CommunityUpdateInfo | null> | null = null

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export const initializeUpdater = async () => {
  if (initialization) return initialization
  initialization = (async () => {
    try {
      if (!isTauriRuntime()) {
        updaterState.status = 'unsupported'
        return
      }
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
