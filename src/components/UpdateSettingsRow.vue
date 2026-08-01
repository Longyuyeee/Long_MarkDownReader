<template>
  <div class="setting-row update-settings-row" data-testid="app-update-settings">
    <div class="info">
      <div class="label">软件更新</div>
      <div class="desc">当前版本 v{{ state.currentVersion }} · 每 24 小时自动检查，也可随时手动检查</div>
      <div v-if="statusText" class="update-status" :class="{ error: state.status === 'error' }">{{ statusText }}</div>
    </div>
    <n-button secondary type="primary" :loading="state.status === 'checking'" :disabled="state.status === 'downloading' || state.status === 'ready'" @click="manualCheck">
      {{ state.status === 'available' ? `安装 v${state.availableVersion}` : '检查更新' }}
    </n-button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { NButton, useMessage } from 'naive-ui'
import { checkForUpdates, initializeUpdater, installAvailableUpdate, updaterState as state } from '../services/appUpdater'

const message = useMessage()
const statusText = computed(() => ({
  current: state.lastCheckedAt ? `已是最新版本 · ${new Date(state.lastCheckedAt).toLocaleString()}` : '已是最新版本',
  available: `发现 v${state.availableVersion}，点击即可更新`,
  downloading: '正在下载并安装，完成后会自动重启…',
  ready: '安装完成，正在重启…',
  error: `检查失败：${state.error}`,
  unsupported: '浏览器预览环境不支持桌面更新',
} as Record<string, string>)[state.status] || '')

const manualCheck = async () => {
  if (state.status === 'available') {
    const installed = await installAvailableUpdate()
    if (!installed && state.error) message.error(`更新失败：${state.error}`)
    return
  }
  const update = await checkForUpdates()
  if (!update && state.status === 'current') message.success('当前已经是最新版本')
  if (state.status === 'error') message.error(`检查更新失败：${state.error}`)
}

onMounted(() => void initializeUpdater())
</script>

<style scoped>
.update-status { margin-top: 4px; color: var(--theme-primary, #5b7cfa); font-size: 11px; }
.update-status.error { color: #d03050; }
</style>
