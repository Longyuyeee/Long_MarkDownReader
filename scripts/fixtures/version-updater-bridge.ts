import { invoke as nativeInvoke, type InvokeArgs, type InvokeOptions } from '@tauri-apps/api/core'

async function scenario() {
  if (!import.meta.env.DEV || await nativeInvoke('plugin:app|identifier') !== 'com.longyuye.mdreader.version-audit') {
    throw new Error('Version fixture requires the isolated development application')
  }
  const response = await fetch('/__version_audit_scenario', { cache: 'no-store' })
  if (!response.ok) throw new Error('Version fixture unavailable')
  const config = await response.json()
  if (!['offline', 'available', 'current'].includes(config.check)) throw new Error('Invalid fixture scenario')
  return config
}

export async function invoke<T>(command: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  if (command === 'install_community_update') throw new Error('本机版本验收禁止执行安装')
  if (command !== 'check_community_update') return nativeInvoke<T>(command, args, options)
  const config = await scenario()
  if (config.check === 'offline') throw new Error('验收故障注入：网络不可用，请稍后重试')
  const currentVersion = await nativeInvoke<string>('plugin:app|version')
  return {
    available: config.check === 'available', currentVersion,
    latestVersion: config.check === 'available' ? '1.0.23' : currentVersion,
    releaseUrl: 'https://github.com/Longyuyeee/Long_MarkDownReader/releases/latest',
    releaseNotes: '验收模拟发布，仅用于观察版本状态，不可下载或安装。',
    publishedAt: null, installerName: 'fixture-not-an-installer.exe', installerSize: 1024,
    installerSha256: '0'.repeat(64),
  } as T
}

export async function openUrl(_url: string) {
  const config = await scenario()
  if (config.open === 'failure') throw new Error('验收故障注入：系统浏览器无法打开')
  if (config.open !== 'success') throw new Error('Invalid opener fixture')
  // Simulated external API success; the real opener is covered by native observation.
}
