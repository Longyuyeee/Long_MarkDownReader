<template>
  <section class="external-office" data-testid="e3-wps-native-workspace">
    <header>
      <div class="identity">
        <FileType2 :size="20" aria-hidden="true" />
        <div>
          <strong>{{ fileName }}</strong>
          <span>{{ report?.formatLabel || format?.label || 'WPS 原生文件' }} · 外部打开</span>
        </div>
      </div>
      <button :disabled="loading" title="重新识别" @click="load">
        <RefreshCw :size="16" :class="{ spinning: loading }" />
      </button>
    </header>

    <div v-if="loading && !report" class="state">
      <RefreshCw :size="20" class="spinning" />
      <span>正在验证文件容器</span>
    </div>
    <div v-else-if="loadError" class="state error">
      <ShieldAlert :size="22" />
      <div><strong>无法确认文件身份</strong><p>{{ loadError }}</p></div>
    </div>
    <main v-else-if="report">
      <div class="status">
        <ShieldCheck :size="22" />
        <div>
          <strong>文件身份已确认</strong>
          <span>识别过程只读，源文件摘要保持不变</span>
        </div>
      </div>
      <dl>
        <div><dt>格式</dt><dd>{{ report.formatLabel }} ({{ report.extension }})</dd></div>
        <div><dt>容器</dt><dd>{{ report.containerKind }}</dd></div>
        <div><dt>大小</dt><dd>{{ formatBytes(report.size) }}</dd></div>
        <div><dt>修改时间</dt><dd>{{ formatTime(report.modified) }}</dd></div>
        <div class="digest"><dt>SHA-256</dt><dd>{{ report.sha256 }}</dd></div>
      </dl>
      <p class="boundary">{{ format?.userCapability.description }}</p>
      <ExternalApplicationPanel :path="documentPath" />
    </main>
  </section>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { FileType2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { findFileFormat } from '../config/fileFormats'
import ExternalApplicationPanel from '../components/workspace/ExternalApplicationPanel.vue'
import { useAppStore } from '../store/app'

interface WpsNativeInspection {
  path: string
  formatId: string
  formatLabel: string
  extension: string
  containerKind: string
  size: number
  modified: number
  sha256: string
  sourcePreserved: boolean
  readOnly: boolean
}

const route = useRoute()
const store = useAppStore()
const report = ref<WpsNativeInspection>()
const loading = ref(false)
const loadError = ref('')
const documentPath = computed(() => String(route.query.path || store.activeTabId || ''))
const fileName = computed(() => documentPath.value.split(/[\\/]/).pop() || '未命名 WPS 文件')
const format = computed(() => findFileFormat(documentPath.value))

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(1)} MiB`
}
const formatTime = (value: number) => value
  ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value * 1000))
  : '未知'

const load = async () => {
  if (!documentPath.value || loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    report.value = await invoke<WpsNativeInspection>('inspect_wps_native_file', {
      libraryRoot: store.libraryPath,
      path: documentPath.value,
    })
  } catch (error) {
    report.value = undefined
    loadError.value = String(error).replace(/^Error:\s*/, '')
  } finally {
    loading.value = false
  }
}

watch(documentPath, load, { immediate: true })
</script>

<style scoped>
.external-office { display: flex; width: 100%; height: 100%; min-width: 0; flex-direction: column; color: var(--theme-text); background: var(--theme-bg); container-type: inline-size; }
header { display: flex; min-height: 52px; align-items: center; justify-content: space-between; padding: 0 14px; border-bottom: var(--theme-border); }
.identity { display: flex; min-width: 0; align-items: center; gap: 10px; }
.identity div { display: grid; min-width: 0; gap: 2px; }
.identity strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.identity span, .status span { color: var(--theme-text-secondary); font-size: 11px; }
button { display: grid; width: 30px; height: 30px; place-items: center; border: 0; border-radius: 5px; color: inherit; background: transparent; cursor: pointer; }
button:hover { background: var(--theme-hover); }
button:disabled { opacity: .45; cursor: default; }
main { width: min(760px, calc(100% - 40px)); margin: 34px auto; }
.status { display: flex; align-items: center; gap: 12px; padding-bottom: 22px; border-bottom: var(--theme-border); color: var(--theme-primary); }
.status div { display: grid; gap: 3px; }
.status strong { font-size: 15px; }
dl { margin: 0; }
dl div { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 16px; padding: 14px 0; border-bottom: var(--theme-border); }
dt { color: var(--theme-text-secondary); font-size: 12px; }
dd { min-width: 0; margin: 0; font-size: 12px; }
.digest dd { overflow-wrap: anywhere; font-family: var(--font-mono); font-size: 11px; }
.boundary { margin: 22px 0 0; color: var(--theme-text-secondary); font-size: 12px; line-height: 1.7; }
.state { display: flex; flex: 1; align-items: center; justify-content: center; gap: 10px; color: var(--theme-text-secondary); }
.state.error { color: var(--theme-danger); }
.state.error div { max-width: 520px; }
.state.error strong { color: var(--theme-text); }
.state.error p { margin: 5px 0 0; line-height: 1.5; }
.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@container (max-width: 640px) {
  main { width: calc(100% - 24px); margin-top: 22px; }
  dl div { grid-template-columns: 86px minmax(0, 1fr); }
}
</style>
