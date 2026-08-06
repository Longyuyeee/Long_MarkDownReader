<template>
  <n-modal
    :show="showPrompt"
    preset="card"
    class="update-modal"
    title="发现新版本"
    :mask-closable="false"
    @close="dismiss"
  >
    <div class="version-line">
      <span>v{{ state.currentVersion }}</span>
      <ArrowRightIcon :size="17" aria-hidden="true" />
      <strong>v{{ state.latestVersion }}</strong>
    </div>
    <p class="update-summary">更新将从官方 GitHub Release 下载，并在 SHA-256 校验通过后自动安装。</p>
    <div class="update-facts">
      <span>{{ formatBytes(state.installerSize) }}</span>
      <span>Windows x64</span>
      <span>覆盖安装</span>
    </div>
    <div v-if="releaseNote" class="release-note">{{ releaseNote }}</div>
    <p class="unsigned-note">当前为未签名社区版，Windows 仍可能显示“未知发布者”提示。</p>
    <template #footer>
      <div class="modal-actions">
        <n-button quaternary @click="openRelease">查看发布页</n-button>
        <span class="action-spacer" />
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
import { ArrowRight as ArrowRightIcon, Download as DownloadIcon } from 'lucide-vue-next'
import {
  checkForUpdates,
  installAvailableUpdate,
  openLatestRelease,
  updaterState as state,
} from '../services/appUpdater'

const message = useMessage()
const dismissedVersion = ref('')
const showPrompt = computed(() => (state.status === 'available' || state.status === 'installing') && dismissedVersion.value !== state.latestVersion)
const releaseNote = computed(() => state.releaseNotes.trim().slice(0, 480))

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
.update-modal { width: min(520px, calc(100vw - 32px)); }
.version-line { display: flex; align-items: center; gap: 10px; font-size: 16px; }
.version-line strong { color: var(--theme-primary, #5b7cfa); }
.update-summary, .unsigned-note { margin: 12px 0 0; line-height: 1.6; color: var(--theme-text-secondary, #667085); }
.unsigned-note { font-size: 12px; }
.update-facts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.update-facts span { padding: 4px 8px; border: 1px solid var(--theme-border, #d9dce3); border-radius: 6px; font-size: 12px; }
.release-note { max-height: 130px; margin-top: 14px; padding: 10px 12px; overflow: auto; white-space: pre-wrap; border-left: 3px solid var(--theme-primary, #5b7cfa); background: color-mix(in srgb, var(--theme-primary, #5b7cfa) 7%, transparent); line-height: 1.55; }
.modal-actions { display: flex; align-items: center; gap: 8px; }
.action-spacer { flex: 1; }
@media (max-width: 560px) { .modal-actions { flex-wrap: wrap; } .action-spacer { display: none; } }
</style>
