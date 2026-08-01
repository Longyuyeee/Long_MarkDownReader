<template>
  <n-modal :show="showPrompt" :mask-closable="!installing" @update:show="closePrompt">
    <n-card class="update-card" title="Long编辑有新版本" :bordered="false" role="dialog" aria-modal="true">
      <div class="update-version">v{{ state.currentVersion }} → v{{ state.availableVersion }}</div>
      <p class="update-copy">更新包会先验证完整性签名，再由安装程序替换当前版本。</p>
      <pre v-if="state.releaseNotes" class="update-notes">{{ state.releaseNotes }}</pre>
      <n-progress v-if="installing" type="line" :percentage="progress" :processing="progress === 0" />
      <p v-if="state.error" class="update-error">{{ state.error }}</p>
      <template #footer>
        <div class="update-actions">
          <n-button :disabled="installing" @click="closePrompt(false)">稍后提醒</n-button>
          <n-button type="primary" :loading="installing" @click="install">下载并安装</n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NButton, NCard, NModal, NProgress, useMessage } from 'naive-ui'
import { checkForUpdates, initializeUpdater, installAvailableUpdate, updaterState as state, updateProgress } from '../services/appUpdater'
import { isTauriRuntime } from '../services/tauriRuntime'

const message = useMessage()
const dismissed = ref(false)
const showPrompt = computed(() => state.status === 'available' && !dismissed.value)
const installing = computed(() => state.status === 'downloading' || state.status === 'ready')
const progress = computed(updateProgress)

const closePrompt = (show: boolean) => {
  if (!show && !installing.value) dismissed.value = true
}

const install = async () => {
  const installed = await installAvailableUpdate()
  if (!installed && state.error) message.error(`更新失败：${state.error}`)
}

onMounted(async () => {
  await initializeUpdater()
  if (!import.meta.env.PROD || !isTauriRuntime()) return
  const lastCheck = Number(localStorage.getItem('longedit:last-update-check') || 0)
  if (Date.now() - lastCheck < 24 * 60 * 60 * 1000) return
  localStorage.setItem('longedit:last-update-check', String(Date.now()))
  window.setTimeout(() => void checkForUpdates(), 4_000)
})
</script>

<style scoped>
.update-card { width: min(520px, calc(100vw - 32px)); border-radius: var(--theme-radius-lg, 14px); }
.update-version { color: var(--theme-primary, #5b7cfa); font-size: 18px; font-weight: 700; }
.update-copy { margin: 10px 0; color: var(--theme-text-secondary, #667085); font-size: 13px; line-height: 1.6; }
.update-notes { max-height: 180px; overflow: auto; padding: 12px; border-radius: 8px; background: var(--theme-surface-muted, rgba(127,127,127,.08)); white-space: pre-wrap; font: inherit; font-size: 12px; }
.update-error { color: #d03050; font-size: 12px; }
.update-actions { display: flex; justify-content: flex-end; gap: 10px; }
</style>
