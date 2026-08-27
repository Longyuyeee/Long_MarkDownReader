import fs from 'node:fs'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const packageVersion = readJson('package.json').version
const tauriVersion = readJson('src-tauri/tauri.conf.json').version
const releaseVersion = readJson('shared/release-capability-matrix.json').appVersion
const developmentVersion = readJson('shared/development-version-policy.json').developmentTargetVersion

const checks = {
  versionsAligned: packageVersion === tauriVersion && tauriVersion === releaseVersion,
  runtimeVersionInitialized: source.includes('void initializeUpdater()'),
  runtimeVersionBound: source.includes('updaterState.currentVersion.trim()') && source.includes('RELEASE_MATRIX_VERSION'),
  visibleMainIndicator: source.includes('data-testid="main-app-version"')
    && source.includes('v{{ displayedAppVersion }}')
    && source.includes('class="version-channel"'),
  accessibleDescription: source.includes(':aria-label="versionIndicatorLabel"'),
  directUpdateRoute: source.includes("focus: 'software-update'") && source.includes('@click.stop="openUpdateSettings"'),
  updateAwareness: source.includes("updaterState.status === 'available'") && source.includes('version-update-dot'),
  keyboardReachableFooter: source.includes('aria-label="打开资料库设置"') && source.includes('@keydown.space.prevent="openSettings"'),
  responsiveContainment: /\.app-version-badge\s*\{[\s\S]*?flex:\s*none;[\s\S]*?white-space:\s*nowrap;[\s\S]*?\}/.test(source),
  compactSidebarFooter: source.includes('@container library-sidebar (max-width: 230px)')
    && source.includes('container-name: library-sidebar')
    && source.includes('.lib-status-dot,')
    && source.includes('.footer-chevron { display: none; }'),
}

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
const evidence = {
  expected: {
    placement: '主界面左侧底部当前资料库卡片',
    version: developmentVersion,
    behavior: '开发环境显示目标补丁版本与 dev 渠道，运行时和公开版本继续读取冻结事实源',
  },
  actual: { packageVersion, tauriVersion, releaseVersion, checks },
}

if (failed.length) {
  console.error(JSON.stringify(evidence, null, 2))
  throw new Error(`Main version indicator contract failed: ${failed.join(', ')}`)
}

console.log(JSON.stringify(evidence, null, 2))
