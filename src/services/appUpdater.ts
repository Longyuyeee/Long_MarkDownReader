import { getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { reactive } from 'vue'
import { isTauriRuntime } from './tauriRuntime'

export const LATEST_RELEASE_URL = 'https://github.com/Longyuyeee/Long_MarkDownReader/releases/latest'

export type UpdateStatus = 'idle' | 'ready' | 'opening' | 'error' | 'unsupported'

export const updaterState = reactive({
  status: 'idle' as UpdateStatus,
  currentVersion: '1.0.0',
  error: '',
})

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export const initializeUpdater = async () => {
  try {
    if (isTauriRuntime()) updaterState.currentVersion = await getVersion()
    updaterState.status = 'ready'
  } catch (error) {
    updaterState.error = errorMessage(error)
    updaterState.status = 'error'
  }
}

export const openLatestRelease = async () => {
  updaterState.status = 'opening'
  updaterState.error = ''
  try {
    if (isTauriRuntime()) await openUrl(LATEST_RELEASE_URL)
    else window.open(LATEST_RELEASE_URL, '_blank', 'noopener,noreferrer')
    updaterState.status = 'ready'
    return true
  } catch (error) {
    updaterState.error = errorMessage(error)
    updaterState.status = 'error'
    return false
  }
}
