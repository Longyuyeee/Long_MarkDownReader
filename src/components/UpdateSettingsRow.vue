<template>
  <div class="setting-row update-settings-row" data-testid="app-update-settings">
    <div class="info">
      <div class="label">软件更新</div>
      <div class="desc">当前版本 v{{ state.currentVersion }} · 社区版暂时采用手动下载安装</div>
      <div v-if="statusText" class="update-status" :class="{ error: state.status === 'error' }">{{ statusText }}</div>
    </div>
    <n-button secondary type="primary" :loading="state.status === 'opening'" @click="openRelease">
      <template #icon><n-icon :component="ExternalLinkIcon" /></template>
      查看最新版本
    </n-button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { NButton, useMessage } from 'naive-ui'
import { ExternalLink as ExternalLinkIcon } from 'lucide-vue-next'
import { initializeUpdater, openLatestRelease, updaterState as state } from '../services/appUpdater'

const message = useMessage()
const statusText = computed(() => ({
  ready: '将打开官方 GitHub Release 页面；下载安装前请核对 SHA-256。',
  opening: '正在打开官方发布页面…',
  error: `无法打开发布页面：${state.error}`,
  unsupported: '当前环境无法打开外部发布页面',
} as Record<string, string>)[state.status] || '')

const openRelease = async () => {
  const opened = await openLatestRelease()
  if (!opened && state.error) message.error(`无法打开官方发布页面：${state.error}`)
}

onMounted(() => void initializeUpdater())
</script>

<style scoped>
.update-status { margin-top: 4px; color: var(--theme-primary, #5b7cfa); font-size: 11px; }
.update-status.error { color: #d03050; }
</style>
