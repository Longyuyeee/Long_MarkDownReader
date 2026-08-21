<template>
  <n-modal
    :show="showPrompt"
    preset="card"
    class="update-modal"
    :style="updateModalStyle"
    :mask-closable="false"
    @close="dismiss"
  >
    <template #header>
      <div class="update-heading">
        <span class="update-heading-icon"><SparklesIcon :size="19" aria-hidden="true" /></span>
        <div>
          <strong>发现新版本</strong>
          <small>已通过官方发布源检查</small>
        </div>
      </div>
    </template>
    <div class="version-line">
      <span>v{{ state.currentVersion }}</span>
      <ArrowRightIcon :size="17" aria-hidden="true" />
      <strong>v{{ state.latestVersion }}</strong>
    </div>
    <p class="update-summary">安装包将从官方 GitHub Release 下载，并在 SHA-256 校验通过后安装。</p>
    <div class="update-facts">
      <span><HardDriveIcon :size="14" aria-hidden="true" />{{ formatBytes(state.installerSize) }}</span>
      <span><MonitorIcon :size="14" aria-hidden="true" />Windows x64</span>
      <span><RefreshCwIcon :size="14" aria-hidden="true" />覆盖安装</span>
    </div>
    <section v-if="releaseHighlights.length" class="release-note">
      <strong>本次更新</strong>
      <ul><li v-for="line in releaseHighlights" :key="line">{{ line }}</li></ul>
    </section>
    <p class="restart-note"><ShieldCheckIcon :size="14" aria-hidden="true" />安装完成后 Long编辑会自动重新打开。</p>
    <p class="unsigned-note">未签名社区版仍可能触发 Windows“未知发布者”提示。</p>
    <template #footer>
      <div class="modal-actions">
        <n-button class="release-link" quaternary @click="openRelease">发布详情</n-button>
        <n-button @click="dismiss">稍后提醒</n-button>
        <n-button type="primary" :loading="state.status === 'installing'" @click="install">
          <template #icon><DownloadIcon /></template>
          下载并安装
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NButton, NModal, useMessage } from 'naive-ui'
import {
  ArrowRight as ArrowRightIcon,
  Download as DownloadIcon,
  HardDrive as HardDriveIcon,
  Monitor as MonitorIcon,
  RefreshCw as RefreshCwIcon,
  ShieldCheck as ShieldCheckIcon,
  Sparkles as SparklesIcon,
} from 'lucide-vue-next'
import {
  checkForUpdates,
  installAvailableUpdate,
  openLatestRelease,
  updaterState as state,
} from '../services/appUpdater'

const message = useMessage()
const dismissedVersion = ref('')
const updateModalStyle = { width: 'min(460px, calc(100vw - 24px))' }
const showPrompt = computed(() => (state.status === 'available' || state.status === 'installing') && dismissedVersion.value !== state.latestVersion)
const releaseHighlights = computed(() => state.releaseNotes
  .split(/\r?\n/)
  .map(line => line.trim().replace(/^#{1,6}\s*/, '').replace(/^[-*+]\s+/, ''))
  .filter(line => line && !/^Long编辑\s+v?\d/i.test(line))
  .slice(0, 4))

const formatBytes = (bytes: number) => bytes > 0 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '安装包'
const dismiss = () => { dismissedVersion.value = state.latestVersion }
const openRelease = async () => { await openLatestRelease() }
const install = async () => {
  const started = await installAvailableUpdate()
  if (!started && state.error) message.error(`更新失败：${state.error}`)
}

watch(() => state.latestVersion, () => { dismissedVersion.value = '' })
onMounted(() => void checkForUpdates(false))
</script>

<style scoped>
.update-heading { display: flex; align-items: center; gap: 11px; }
.update-heading-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--theme-primary, #5b7cfa);
  background: color-mix(in srgb, var(--theme-primary, #5b7cfa) 13%, transparent);
}
.update-heading div { display: grid; gap: 2px; }
.update-heading strong { font-size: 16px; line-height: 1.3; }
.update-heading small { color: var(--theme-text-secondary, #667085); font-size: 11px; font-weight: 500; }
.version-line { display: flex; align-items: center; gap: 10px; font-size: 15px; }
.version-line span { color: var(--theme-text-secondary, #667085); }
.version-line strong { color: var(--theme-primary, #5b7cfa); font-size: 20px; }
.update-summary { margin: 9px 0 0; line-height: 1.55; color: var(--theme-text-secondary, #667085); font-size: 12px; }
.update-facts { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 12px; }
.update-facts span { display: inline-flex; align-items: center; gap: 5px; color: var(--theme-text-secondary, #667085); font-size: 11px; }
.update-facts svg { color: var(--theme-primary, #5b7cfa); }
.release-note {
  max-height: 108px;
  margin-top: 13px;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--theme-primary, #5b7cfa) 24%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--theme-primary, #5b7cfa) 6%, transparent);
}
.release-note strong { display: block; margin-bottom: 5px; font-size: 12px; }
.release-note ul { margin: 0; padding-left: 17px; color: var(--theme-text-secondary, #667085); font-size: 11px; line-height: 1.55; }
.restart-note, .unsigned-note { margin: 10px 0 0; color: var(--theme-text-secondary, #667085); font-size: 11px; line-height: 1.45; }
.restart-note { display: flex; align-items: center; gap: 6px; color: var(--theme-text); }
.restart-note svg { color: var(--theme-success, #22a06b); }
.unsigned-note { margin-top: 5px; }
.modal-actions { display: flex; align-items: center; gap: 8px; }
.release-link { margin-right: auto; }
@media (max-width: 480px) {
  .modal-actions { flex-wrap: wrap; }
  .release-link { width: 100%; margin-right: 0; }
  .modal-actions :deep(.n-button:not(.release-link)) { flex: 1; }
}
</style>
