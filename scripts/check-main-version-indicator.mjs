import fs from 'node:fs'

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const source = fs.readFileSync('src/views/LibraryMode.vue', 'utf8')
const packageVersion = readJson('package.json').version
const tauriVersion = readJson('src-tauri/tauri.conf.json').version
const releaseVersion = readJson('shared/release-capability-matrix.json').appVersion

const checks = {
  versionsAligned: packageVersion === tauriVersion && tauriVersion === releaseVersion,
  runtimeVersionInitialized: source.includes('void initializeUpdater()'),
  runtimeVersionBound: source.includes('updaterState.currentVersion.trim()') && source.includes('RELEASE_MATRIX_VERSION'),
  visibleMainIndicator: source.includes('data-testid="main-app-version"') && source.includes('>v{{ currentAppVersion }}</span>'),
  accessibleDescription: source.includes(':aria-label="`当前软件版本 v${currentAppVersion}`"'),
  responsiveContainment: /\.app-version-badge\s*\{[\s\S]*?flex:\s*none;[\s\S]*?white-space:\s*nowrap;[\s\S]*?\}/.test(source),
}

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
const evidence = {
  expected: {
    placement: '主界面左侧底部当前资料库卡片',
    version: packageVersion,
    behavior: '运行时读取应用版本，初始化期间使用对齐后的发布矩阵版本',
  },
  actual: { packageVersion, tauriVersion, releaseVersion, checks },
}

if (failed.length) {
  console.error(JSON.stringify(evidence, null, 2))
  throw new Error(`Main version indicator contract failed: ${failed.join(', ')}`)
}

console.log(JSON.stringify(evidence, null, 2))
