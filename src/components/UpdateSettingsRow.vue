<template>
  <div class="setting-row update-settings-row" data-testid="app-update-settings">
    <div class="info">
      <div class="label">软件更新</div>
      <div class="desc">当前版本 v{{ state.currentVersion }} · 每 24 小时自动检查，也可随时手动检查</div>
      <div v-if="statusText" class="update-status" :class="{ error: state.status === 'error' }">{{ statusText }}</div>
    </div>
    <div class="update-actions">
      <n-button v-if="state.status === 'available' || state.status === 'installing'" type="primary" :loading="state.status === 'installing'" @click="install">
        <template #icon><n-icon :component="DownloadIcon" /></template>
        下载并安装
      </n-button>
      <n-button secondary :loading="state.status === 'checking'" @click="check">
        <template #icon><n-icon :component="RefreshIcon" /></template>
        检查更新
      </n-button>
      <n-button quaternary title="打开官方发布页" @click="openRelease">
        <template #icon><n-icon :component="ExternalLinkIcon" /></template>
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { NButton, useMessage } from 'naive-ui'
import { Download as DownloadIcon, ExternalLink as ExternalLinkIcon, RefreshCw as RefreshIcon } from 'lucide-vue-next'
import {
  checkForUpdates,
  initializeUpdater,
  installAvailableUpdate,
  openLatestRelease,
  updaterState as state,
} from '../services/appUpdater'

const message = useMessage()
const statusText = computed(() => ({
  ready: '自动检查已启用；安装前会校验官方附件的 SHA-256。',
  checking: '正在连接 GitHub 检查最新版本…',
  'up-to-date': `当前已是最新版本 v${state.currentVersion}。`,
  available: `发现 v${state.latestVersion}，可自动下载并覆盖安装。`,
  installing: '正在下载并校验安装包，完成后软件会退出并自动安装…',
  opening: '正在打开官方发布页面…',
  error: `更新失败：${state.error}`,
  unsupported: '自动更新仅在 Windows 桌面客户端中可用。',
} as Record<string, string>)[state.status] || '')

const check = async () => {
  const result = await checkForUpdates(true)
  if (!result && state.error) message.error(`检查更新失败：${state.error}`)
}
const install = async () => {
  const started = await installAvailableUpdate()
  if (!started && state.error) message.error(`更新失败：${state.error}`)
}
const openRelease = async () => { await openLatestRelease() }

onMounted(() => void initializeUpdater())
</script>

<style scoped>
.update-status { margin-top: 4px; color: var(--theme-primary, #5b7cfa); font-size: 11px; line-height: 1.5; }
.update-status.error { color: #d03050; }
.update-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
</style>
