interface VersionIdentityInput {
  runtimeVersion: string
  buildVersion: string
  developmentBuild: boolean
  developmentTarget: string
  updateStatus: string
  latestVersion: string
}

const validVersion = (value: string) => /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)

/** Installed, planned and remotely observed versions are separate facts. */
export function resolveVersionIdentity(input: VersionIdentityInput) {
  const version = validVersion(input.runtimeVersion) ? input.runtimeVersion : input.buildVersion
  const hasUpdate = ['available', 'installing'].includes(input.updateStatus) && validVersion(input.latestVersion)
  const remoteLabel = hasUpdate
    ? `可更新至 v${input.latestVersion}`
    : input.updateStatus === 'up-to-date' && validVersion(input.latestVersion)
      ? `已核对远端版本 v${input.latestVersion}`
      : input.updateStatus === 'checking' ? '正在检查更新'
        : input.updateStatus === 'error' ? '更新检查失败，最新版本未知'
          : input.updateStatus === 'unsupported' ? '当前环境无法检查更新' : '尚未检查更新'
  const developmentLabel = input.developmentBuild ? `开发模式 · 下一目标 v${input.developmentTarget}` : ''
  return {
    version,
    hasUpdate,
    developmentLabel,
    remoteLabel,
    indicatorLabel: [`当前软件版本 v${version}`, developmentLabel, remoteLabel, '点击查看更新'].filter(Boolean).join('，'),
  }
}
