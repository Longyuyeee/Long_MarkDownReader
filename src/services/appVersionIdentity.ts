import { computed } from 'vue'
import appPackage from '../../package.json'
import { DEVELOPMENT_CHANNEL_ACTIVE, DEVELOPMENT_TARGET_VERSION } from '../config/releaseCapabilities'
import { updaterState } from './appUpdater'
import { resolveVersionIdentity } from '../utils/versionIdentity'

export const appVersionIdentity = computed(() => resolveVersionIdentity({
  runtimeVersion: updaterState.currentVersion,
  buildVersion: appPackage.version,
  developmentBuild: DEVELOPMENT_CHANNEL_ACTIVE,
  developmentTarget: DEVELOPMENT_TARGET_VERSION,
  updateStatus: updaterState.status,
  latestVersion: updaterState.latestVersion,
}))
